export type LessonMetadataQuizItem = {
	id?: string;
	question: string;
	answer?: string;
	explanation?: string;
	difficulty?: string;
};

export type LessonMetadata = {
	title?: string;
	summary?: string;
	bulletSummary?: string[];
	objectives?: string[];
	tags?: string[];
	keyTakeaways?: string[];
	sections?: string[];
	readingTimeMinutes?: number;
	quiz?: LessonMetadataQuizItem[];
	[key: string]: unknown;
};
