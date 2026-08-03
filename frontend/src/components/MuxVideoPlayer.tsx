import MuxPlayer from '@mux/mux-player-react';
import { useRef, type ComponentProps, type SyntheticEvent } from 'react';
import { muxEnvKey } from '../lib/mux';

type MuxPlayerProps = ComponentProps<typeof MuxPlayer>;

export interface MediaProgressEvent {
  currentTarget?: { currentTime?: number; duration?: number };
  target?: { currentTime?: number; duration?: number };
}

function toMediaProgressEvent(event: SyntheticEvent<HTMLVideoElement>): MediaProgressEvent {
  return {
    currentTarget: {
      currentTime: event.currentTarget.currentTime,
      duration: event.currentTarget.duration,
    },
    target: {
      currentTime: event.currentTarget.currentTime,
      duration: event.currentTarget.duration,
    },
  };
}

export interface MuxVideoPlayerProps {
  playbackId?: string;
  playbackToken?: string | null;
  contentUrl?: string;
  title: string;
  startTime?: number;
  onTimeUpdate?: (event: MediaProgressEvent) => void;
  onPause?: (event: MediaProgressEvent) => void;
  onEnded?: (event: MediaProgressEvent) => void;
  onError?: () => void;
}

export function MuxVideoPlayer({
  playbackId,
  playbackToken,
  contentUrl,
  title,
  startTime,
  onTimeUpdate,
  onPause,
  onEnded,
  onError,
}: MuxVideoPlayerProps) {
  const fallbackVideoRef = useRef<HTMLVideoElement>(null);
  const envKey = muxEnvKey();

  if (playbackId) {
    return (
      <MuxPlayer
        className="video-player"
        playbackId={playbackId}
        metadataVideoTitle={title}
        tokens={playbackToken ? { playback: playbackToken } : undefined}
        {...(envKey ? { envKey } : {})}
        {...(startTime ? { startTime } : {})}
        playsInline
        onTimeUpdate={onTimeUpdate as MuxPlayerProps['onTimeUpdate']}
        onPause={onPause as MuxPlayerProps['onPause']}
        onEnded={onEnded as MuxPlayerProps['onEnded']}
        onError={onError}
      />
    );
  }

  if (!contentUrl) {
    return <div className="empty-state">This video has no playback source yet.</div>;
  }

  return (
    <video
      ref={fallbackVideoRef}
      className="video-player"
      src={contentUrl}
      controls
      playsInline
      onLoadedMetadata={() => {
        if (fallbackVideoRef.current && startTime) {
          fallbackVideoRef.current.currentTime = startTime;
        }
      }}
      onTimeUpdate={(event) => onTimeUpdate?.(toMediaProgressEvent(event))}
      onPause={(event) => onPause?.(toMediaProgressEvent(event))}
      onEnded={(event) => onEnded?.(toMediaProgressEvent(event))}
    />
  );
}
