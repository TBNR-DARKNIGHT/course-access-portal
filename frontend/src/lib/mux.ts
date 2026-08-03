export function muxThumbnailUrl(playbackId: string, width = 720): string {
  return `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg?width=${width}&time=1`;
}

export function muxSignedThumbnailUrl(playbackId: string, token: string): string {
  return `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg?token=${encodeURIComponent(token)}`;
}

export function muxEnvKey(): string | undefined {
  return import.meta.env.VITE_MUX_ENV_KEY?.trim() || undefined;
}
