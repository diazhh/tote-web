// Builds a 9:16 story-video (MP4 H.264) from a 1080×1920 story PNG.
// Gentle Ken Burns zoom + fade in/out + a silent audio track so IG/FB Stories
// accept it. ffmpeg must be on PATH (same assumption as video-generator.service).
import ffmpeg from 'fluent-ffmpeg';
import logger from '../logger.js';

/**
 * @param {object} o
 * @param {string} o.imagePath  absolute path to the 1080×1920 story PNG
 * @param {string} o.outPath    absolute path for the output .mp4
 * @param {number} [o.durationSec=6]
 * @returns {Promise<string>} outPath
 */
export function buildStoryVideo({ imagePath, outPath, durationSec = 6 }) {
  const dur = durationSec;
  const fps = 30;
  const frames = Math.round(fps * dur);
  const fadeOut = (dur - 0.5).toFixed(2);
  // Upscale first so the zoompan crop moves sub-pixel-smooth (avoids jitter).
  // The silent audio is generated inside the filtergraph (anullsrc) to avoid a
  // second -i input (fluent-ffmpeg mis-detects the lavfi input format).
  const vf =
    `[0:v]scale=2160:3840,` +
    `zoompan=z='min(zoom+0.0006,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps},` +
    `fade=t=in:st=0:d=0.5,fade=t=out:st=${fadeOut}:d=0.5,format=yuv420p[v]`;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1'])
      .complexFilter([vf, 'anullsrc=channel_layout=stereo:sample_rate=44100[a]'])
      .outputOptions([
        '-map [v]', '-map [a]',
        '-c:v libx264', '-pix_fmt yuv420p', '-profile:v high', '-level 4.0',
        `-r ${fps}`, `-t ${dur}`, '-shortest',
        '-c:a aac', '-b:a 128k',
        '-movflags +faststart',
      ])
      .on('end', () => { logger.info(`[story-video] generado: ${outPath}`); resolve(outPath); })
      .on('error', (err) => { logger.error(`[story-video] ffmpeg error: ${err.message}`); reject(err); })
      .save(outPath);
  });
}
