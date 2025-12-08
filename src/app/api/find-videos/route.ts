import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requirePremiumAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

interface VideoResult {
  videoId: string;
  title: string;
  channel: string;
  description: string;
  thumbnail: string;
  duration: string; // ISO 8601 duration format (e.g., "PT10M30S") - will be formatted before return
  views: number;
  viewsFormatted?: string; // Formatted views (e.g., "1.2M views")
}

interface YouTubeSearchResponse {
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      description: string;
      thumbnails: {
        medium: { url: string };
      };
    };
  }>;
}

interface YouTubeVideoDetailsResponse {
  items: Array<{
    id: string;
    contentDetails: {
      duration: string; // ISO 8601 format
    };
    statistics: {
      viewCount: string;
    };
  }>;
}

function formatDuration(isoDuration: string): string {
  // Parse ISO 8601 duration (e.g., "PT10M30S" = 10 minutes 30 seconds)
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatViews(viewCount: number): string {
  if (viewCount >= 1_000_000_000) {
    return `${(viewCount / 1_000_000_000).toFixed(1)}B views`;
  }
  if (viewCount >= 1_000_000) {
    return `${(viewCount / 1_000_000).toFixed(1)}M views`;
  }
  if (viewCount >= 1_000) {
    return `${(viewCount / 1_000).toFixed(1)}K views`;
  }
  return `${viewCount} views`;
}

async function getVideoDetails(videoIds: string[], apiKey: string): Promise<Map<string, { duration: string; views: number }>> {
  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?` +
    `part=contentDetails,statistics&` +
    `id=${videoIds.join(',')}&` +
    `key=${apiKey}`;

  const response = await fetch(detailsUrl);
  
  if (!response.ok) {
    console.error('YouTube API error getting video details:', response.status);
    return new Map();
  }

  const data: YouTubeVideoDetailsResponse = await response.json();
  const detailsMap = new Map<string, { duration: string; views: number }>();
  
  for (const item of data.items) {
    const viewCount = parseInt(item.statistics.viewCount || '0', 10);
    detailsMap.set(item.id, {
      duration: item.contentDetails.duration,
      views: viewCount,
    });
  }
  
  return detailsMap;
}

async function searchYouTube(query: string, maxResults: number = 5): Promise<VideoResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not configured. Please add it to your .env file.');
  }

  // Search for educational videos with better relevance
  // Using exact phrase matching and relevance ordering
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
    `part=snippet&` +
    `q=${encodeURIComponent(query)}&` +
    `type=video&` +
    `maxResults=${maxResults}&` +
    `videoEmbeddable=true&` +
    `videoSyndicated=true&` +
    `order=relevance&` +
    `safeSearch=strict&` + // Filter out inappropriate content
    `relevanceLanguage=en&` + // Prioritize English content (can be made configurable)
    `key=${apiKey}`;

  const response = await fetch(searchUrl);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('YouTube API error:', response.status, errorText);
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data: YouTubeSearchResponse = await response.json();
  const videoIds = data.items.map(item => item.id.videoId);
  
  // Get video details (duration and views)
  const detailsMap = await getVideoDetails(videoIds, apiKey);
  
  return data.items
    .map((item) => {
      const details = detailsMap.get(item.id.videoId);
      return {
        videoId: item.id.videoId,
        title: item.snippet.title,
        channel: item.snippet.channelTitle,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.medium.url,
        duration: details?.duration || '',
        views: details?.views || 0,
      };
    })
    .filter((video) => {
      // Filter out shorts - videos under 60 seconds
      if (!video.duration) return true; // Keep if we don't have duration info
      const durationMatch = video.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!durationMatch) return true;
      
      const hours = parseInt(durationMatch[1] || '0', 10);
      const minutes = parseInt(durationMatch[2] || '0', 10);
      const seconds = parseInt(durationMatch[3] || '0', 10);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      
      // Filter out videos shorter than 60 seconds (shorts)
      return totalSeconds >= 60;
    });
}

export async function POST(req: NextRequest) {
  try {
    // Check premium access
    const premiumCheck = await requirePremiumAccess();
    if (!premiumCheck.ok) {
      return NextResponse.json({ ok: false, error: premiumCheck.error }, { status: 403 });
    }

    const body = await req.json();
    const { lessonTitle, lessonSummary, lessonBody, courseName, courseContext } = body;

    if (!lessonTitle) {
      return NextResponse.json({ ok: false, error: 'Lesson title is required' }, { status: 400 });
    }

    // Detect the language of the lesson
    let detectedLanguage = { code: 'en', name: 'English' };
    try {
      const languageSample = [lessonTitle, lessonSummary, lessonBody?.substring(0, 500)].filter(Boolean).join(' ');
      if (languageSample.trim()) {
        const langResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            { 
              role: 'system', 
              content: 'Detect the primary language of the provided text. Return STRICT JSON: { code: string; name: string } where code is ISO 639-1 (e.g., "en", "sv", "de"). If uncertain, default to { code: "en", name: "English" }.' 
            },
            { role: 'user', content: languageSample.substring(0, 2000) }
          ],
          temperature: 0,
          max_tokens: 50,
        });
        const langData = JSON.parse(langResponse.choices[0]?.message?.content || '{}');
        detectedLanguage = {
          code: String(langData.code || 'en'),
          name: String(langData.name || 'English'),
        };
      }
    } catch (error) {
      console.error('Language detection failed:', error);
      // Keep default English
    }

    // Build comprehensive context for OpenAI to generate good search queries
    let searchContext = `Lesson Topic/Title: ${lessonTitle}`;
    
    if (lessonBody) {
      // Extract first 500 characters of lesson body for context
      const bodyPreview = lessonBody.replace(/[#*`\[\]()]/g, '').substring(0, 500).trim();
      if (bodyPreview) {
        searchContext += `\n\nLesson Content (first 500 chars):\n${bodyPreview}`;
      }
    }
    
    if (lessonSummary) {
      searchContext += `\n\nLesson Summary: ${lessonSummary}`;
    }
    
    if (courseName) {
      searchContext += `\n\nCourse: ${courseName}`;
    }
    
    if (courseContext) {
      searchContext += `\n\nCourse Context: ${courseContext}`;
    }

    // Generate queries in the lesson's language
    const systemPromptOriginal = `You are an expert at creating natural, effective YouTube search queries for educational content.

CRITICAL REQUIREMENTS:
1. Read the FULL lesson context (title, content, summary) to deeply understand what is being taught
2. Create NATURAL, well-crafted search queries - don't just append words to the title
3. Think about what someone would actually search for on YouTube to learn this topic
4. Use natural language that flows well - queries should sound like real searches
5. Include the core topic/concept but phrase it naturally with educational intent
6. Make queries specific enough to find relevant videos, but natural enough to match how people actually search
7. Each query should be 4-10 words and sound like a real YouTube search
8. AVOID just combining the title with "explained" or "tutorial" - create thoughtful, natural queries

GOOD examples (natural and specific):
- Lesson about "z-transform": "z transform explained discrete time systems"
- Lesson about "Laplace transform": "Laplace transform introduction signal processing"
- Lesson about "Fourier series": "Fourier series tutorial mathematics"

BAD examples (unnatural or too generic):
- "z transform explained tutorial" (too mechanical)
- "signal processing" (missing specific topic)
- "mathematics" (way too broad)

Return your response as a JSON object with this structure:
{
  "queries": ["natural query 1", "natural query 2", "natural query 3"]
}

Return 2-3 natural, well-crafted queries in the SAME LANGUAGE as the lesson. Only return the JSON object, nothing else.`;

    // Generate queries in the lesson's original language
    let queriesOriginal: string[] = [];
    try {
      const completionOriginal = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPromptOriginal },
          { 
            role: "user", 
            content: `Generate natural YouTube search queries for this lesson. Create queries in the SAME LANGUAGE as the lesson content. Make them sound like real searches people would make:\n\n${searchContext}\n\nReturn as JSON with a "queries" array. All queries must be in the same language as the lesson.` 
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 300,
      });

      const responseTextOriginal = completionOriginal.choices[0]?.message?.content?.trim() || '';
      const parsedOriginal = JSON.parse(responseTextOriginal);
      if (Array.isArray(parsedOriginal.queries)) {
        queriesOriginal = parsedOriginal.queries
          .filter((q: any) => typeof q === 'string' && q.trim().length > 0)
          .map((q: string) => q.trim());
      }
    } catch (error) {
      console.error('Failed to generate queries in original language:', error);
    }

    // Generate queries in English (translated/adapted)
    let queriesEnglish: string[] = [];
    if (detectedLanguage.code !== 'en') {
      try {
        const systemPromptEnglish = `You are an expert at creating natural, effective YouTube search queries for educational content in English.

CRITICAL REQUIREMENTS:
1. Translate and adapt the lesson content to create natural English YouTube search queries
2. Create NATURAL, well-crafted search queries - don't just translate word-for-word
3. Think about what English speakers would search for on YouTube to learn this topic
4. Use natural English that flows well - queries should sound like real searches
5. Include the core topic/concept but phrase it naturally with educational intent
6. Make queries specific enough to find relevant videos, but natural enough to match how people actually search
7. Each query should be 4-10 words and sound like a real YouTube search

Return your response as a JSON object with this structure:
{
  "queries": ["natural English query 1", "natural English query 2", "natural English query 3"]
}

Return 2-3 natural, well-crafted queries in ENGLISH. Only return the JSON object, nothing else.`;

        const completionEnglish = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPromptEnglish },
            { 
              role: "user", 
              content: `Translate and adapt this lesson to create natural English YouTube search queries. The lesson is in ${detectedLanguage.name}. Create queries that English speakers would use to find videos about this topic:\n\n${searchContext}\n\nReturn as JSON with a "queries" array. All queries must be in English.` 
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.4,
          max_tokens: 300,
        });

        const responseTextEnglish = completionEnglish.choices[0]?.message?.content?.trim() || '';
        const parsedEnglish = JSON.parse(responseTextEnglish);
        if (Array.isArray(parsedEnglish.queries)) {
          queriesEnglish = parsedEnglish.queries
            .filter((q: any) => typeof q === 'string' && q.trim().length > 0)
            .map((q: string) => q.trim());
        }
      } catch (error) {
        console.error('Failed to generate English queries:', error);
      }
    } else {
      // If already English, use the original queries as English queries
      queriesEnglish = queriesOriginal;
    }

    // Combine queries: original language first, then English
    const queries = [...queriesOriginal, ...queriesEnglish].filter((q, idx, arr) => arr.indexOf(q) === idx); // Remove duplicates

    // Only use AI-generated queries - no fallbacks
    if (queries.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Failed to generate search queries. Please try again.' 
      }, { status: 500 });
    }

    // Search YouTube with the generated queries
    // Search in original language first, then English
    const allVideos: VideoResult[] = [];
    const seenVideoIds = new Set<string>();

    // Search with original language queries first
    for (const query of queriesOriginal.slice(0, 2)) {
      try {
        const videos = await searchYouTube(query, 5);
        for (const video of videos) {
          if (!seenVideoIds.has(video.videoId)) {
            seenVideoIds.add(video.videoId);
            allVideos.push(video);
          }
        }
      } catch (error: any) {
        console.error(`Error searching YouTube with query "${query}":`, error);
      }
    }

    // Then search with English queries (if different from original)
    if (detectedLanguage.code !== 'en' && queriesEnglish.length > 0) {
      for (const query of queriesEnglish.slice(0, 2)) {
        try {
          const videos = await searchYouTube(query, 5);
          for (const video of videos) {
            if (!seenVideoIds.has(video.videoId) && allVideos.length < 8) {
              seenVideoIds.add(video.videoId);
              allVideos.push(video);
            }
          }
        } catch (error: any) {
          console.error(`Error searching YouTube with English query "${query}":`, error);
        }
      }
    }

    // No fallback - only use AI-generated queries

    // Remove duplicates
    const uniqueVideos = Array.from(
      new Map(allVideos.map(v => [v.videoId, v])).values()
    );

    // Prioritize videos that have the lesson topic in the title (more relevant)
    const topicWords = lessonTitle.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    const sortedVideos = uniqueVideos.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      
      // Count how many topic words appear in the title
      const aMatches = topicWords.filter((word: string) => aTitle.includes(word)).length;
      const bMatches = topicWords.filter((word: string) => bTitle.includes(word)).length;
      
      // Videos with more topic words in title come first
      if (aMatches !== bMatches) {
        return bMatches - aMatches;
      }
      
      // If same number of matches, prefer videos with higher view count (more popular/trusted)
      return b.views - a.views;
    });

    // Limit to 5 most relevant videos
    const topVideos = sortedVideos.slice(0, 5);

    if (topVideos.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Could not find relevant videos. Please check that YOUTUBE_API_KEY is configured correctly.' 
      }, { status: 404 });
    }

    // Format duration and views for display
    const formattedVideos = topVideos.map(video => ({
      ...video,
      duration: formatDuration(video.duration),
      viewsFormatted: formatViews(video.views),
    }));

    // Get user subscription level for showing queries to tester tier
    const subscriptionLevel = premiumCheck.user?.subscriptionLevel || 'Free';

    return NextResponse.json({ 
      ok: true, 
      videos: formattedVideos,
      queries: [...queriesOriginal, ...queriesEnglish], // Return both original language and English queries
      subscriptionLevel: subscriptionLevel
    });
  } catch (error: any) {
    console.error('Error in find-videos:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to find videos' },
      { status: 500 }
    );
  }
}

