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

    // Use OpenAI to generate effective YouTube search queries that are SPECIFIC to the lesson topic
    const systemPrompt = `You are a helpful assistant that generates SPECIFIC YouTube search queries for educational content based on lesson context.

CRITICAL REQUIREMENTS:
1. Read the FULL lesson context provided (title, content, summary) to understand what is being taught
2. The search query MUST include the exact lesson topic/title AND reflect what is actually taught in the lesson
3. Use the lesson content to understand the specific concepts, not just the title
4. Make the query SPECIFIC to what the lesson teaches - don't make it generic
5. Add educational keywords like "explained", "tutorial", "lecture", "introduction", or "how to"
6. Keep the lesson topic as the MAIN focus of the query
7. If the topic is technical, keep technical terms from the lesson
8. Make queries 4-10 words - specific enough to find relevant educational videos
9. AVOID generic terms that don't relate to the specific lesson content

Example: If lesson is about "z-transform" and teaches discrete-time systems, good queries:
- "z transform discrete time systems explained"
- "z transform tutorial signal processing"
- "z transform analysis explained"

BAD examples (too generic or irrelevant):
- "signal processing" (missing the specific z-transform topic)
- "mathematics" (way too broad)
- "full body transplant" (completely irrelevant)

Return your response as a JSON object with this structure:
{
  "queries": ["specific topic from lesson + educational term", "specific topic + different educational term"]
}

Return 2-3 queries. Each query MUST be relevant to what is actually taught in the lesson. Only return the JSON object, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { 
          role: "user", 
          content: `Based on this lesson, generate SPECIFIC YouTube search queries that will find educational videos about what is being taught:\n\n${searchContext}\n\nIMPORTANT: Read the lesson content to understand what is actually being taught, not just the title. Generate queries that are specific to the lesson topic and content. Return as JSON with a "queries" array.` 
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3, // Lower temperature for more focused queries
      max_tokens: 300,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '';
    let queries: string[] = [];
    
    try {
      const parsed = JSON.parse(responseText);
      if (Array.isArray(parsed.queries)) {
        queries = parsed.queries
          .filter((q: any) => typeof q === 'string' && q.trim().length > 0)
          .map((q: string) => q.trim());
      }
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError);
    }

    // Only use AI-generated queries - no fallbacks
    if (queries.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Failed to generate search queries. Please try again.' 
      }, { status: 500 });
    }

    // Search YouTube with the generated queries
    // Prioritize the first query (most specific) and get more results from it
    const allVideos: VideoResult[] = [];
    const seenVideoIds = new Set<string>();

    // Use the primary query (first one) to get more results since it's most specific
    if (queries.length > 0) {
      try {
        const primaryVideos = await searchYouTube(queries[0], 8); // Get more from primary query
        for (const video of primaryVideos) {
          if (!seenVideoIds.has(video.videoId)) {
            seenVideoIds.add(video.videoId);
            allVideos.push(video);
          }
        }
      } catch (error: any) {
        console.error(`Error searching YouTube with primary query "${queries[0]}":`, error);
      }
    }

    // Add a few more from secondary queries if we don't have enough
    if (allVideos.length < 5 && queries.length > 1) {
      for (const query of queries.slice(1, 3)) { // Use up to 2 more queries
        try {
          const videos = await searchYouTube(query, 3);
          for (const video of videos) {
            if (!seenVideoIds.has(video.videoId) && allVideos.length < 5) {
              seenVideoIds.add(video.videoId);
              allVideos.push(video);
            }
          }
        } catch (error: any) {
          console.error(`Error searching YouTube with query "${query}":`, error);
          // Continue with next query if one fails
        }
      }
    }

    // If we still don't have videos, try a simple fallback search
    if (allVideos.length === 0) {
      try {
        const fallbackVideos = await searchYouTube(lessonTitle, 5);
        allVideos.push(...fallbackVideos);
      } catch (error: any) {
        console.error('Fallback YouTube search failed:', error);
      }
    }

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
      const aMatches = topicWords.filter(word => aTitle.includes(word)).length;
      const bMatches = topicWords.filter(word => bTitle.includes(word)).length;
      
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
      queries: queries, // Return the AI-generated queries
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

