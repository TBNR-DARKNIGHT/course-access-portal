export type ResourceType = 'video' | 'pdf' | 'article' | 'module';
export type ResourceAccess = 'public' | 'paid';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface CourseModule {
  id: string;
  title: string;
}

export interface CourseDefinition {
  id: string;
  title: string;
  shortLabel: string;
  description: string;
  modules?: CourseModule[];
}

export interface Resource {
  id: string;
  title: string;
  courseId: string;
  moduleId?: string | null;
  type: ResourceType;
  topic: string;
  description: string;
  duration?: string;
  access: ResourceAccess;
  bucket?: string;
  filePath?: string;
  thumbnailUrl?: string;
  contentUrl?: string;
  muxPlaybackId?: string;
  muxPlaybackSigned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceProgress {
  resourceId: string;
  userId: string;
  status: ProgressStatus;
  completed: boolean;
  progressPercent: number;
  completedAt?: string;
  lastAccessedAt?: string;
  lastPositionSeconds?: number;
  durationSeconds?: number;
  pagesViewed?: number[];
  pageCount?: number;
  completionSource?: 'manual' | 'video_threshold' | 'video_ended';
}

export interface CurrentUser {
  id: string;
  clerkUserId: string;
  email: string | null;
  role: 'CLIENT' | 'ADMIN';
}

export interface AdminResourceInput {
  title: string;
  courseId: string;
  moduleId?: string | null;
  type: ResourceType;
  topic: string;
  description: string;
  duration?: string;
  access: ResourceAccess;
  bucket?: string;
  filePath?: string;
  thumbnailUrl?: string;
  contentUrl?: string;
  muxPlaybackId?: string;
  muxPlaybackSigned?: boolean;
}
