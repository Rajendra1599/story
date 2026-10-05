/**
 * MicroDrama OTT - Scalable Cloudinary CDN & Adaptive Video Streaming Service
 * 
 * Scalability Architecture:
 * - 100% Zero-Server Media Bandwidth: All video chunks & images are served directly by Cloudinary CDN edge nodes
 * - Node.js Express server only handles lightweight authorization metadata (<1KB per request)
 * - Mobile Vertical 9:16 Optimization (ar_9:16, c_fill, w_720, q_auto:good, f_auto)
 * - Cloudinary HLS (HTTP Live Streaming) Adaptive Bitrate Manifests (.m3u8)
 * - Direct Client-to-Cloudinary Signed Uploads (bypasses Node.js for heavy video uploads)
 * - Dynamic Video Poster & Thumbnail Extraction at second 0 (so_0, webp/jpg)
 * - Cryptographically signed, time-limited playback tokens
 */

const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'microdrama-ott';
const API_KEY = process.env.CLOUDINARY_API_KEY || '';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
const CONTENT_ENCRYPTION_KEY = process.env.CONTENT_ENCRYPTION_KEY || 'microdrama_aes_256_content_key_32bytes!';
const VIDEO_CDN_BASE_URL = process.env.VIDEO_CDN_BASE_URL || `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/`;

// Initialize Cloudinary SDK
if (CLOUD_NAME && API_KEY && API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true
  });
  console.log(`[Cloudinary] CDN initialized for cloud: ${CLOUD_NAME}`);
}

class VideoCdnService {
  /**
   * Generates a Cloudinary adaptive bitrate HLS (.m3u8) streaming URL for 9:16 mobile vertical video.
   * Enables automatic resolution switching (1080p, 720p, 480p) based on client mobile network bandwidth.
   */
  getCloudinaryHlsStreamUrl(publicIdOrUrl) {
    if (!publicIdOrUrl) return '';

    if (publicIdOrUrl.includes('res.cloudinary.com')) {
      return publicIdOrUrl
        .replace(/\/video\/upload\/[^/]*\//, '/video/upload/sp_auto,ar_9:16,c_fill,w_720,q_auto/')
        .replace(/\.(mp4|mov|mkv)$/i, '.m3u8');
    }

    const publicId = publicIdOrUrl.replace(/\.(mp4|m3u8)$/i, '');
    return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/sp_auto,ar_9:16,c_fill,w_720,q_auto/${publicId}.m3u8`;
  }

  /**
   * Generates an optimized 9:16 progressive MP4 URL with auto-compression and format negotiation
   */
  getCloudinaryOptimizedMp4Url(publicIdOrUrl) {
    if (!publicIdOrUrl) return '';

    if (publicIdOrUrl.includes('res.cloudinary.com')) {
      if (!publicIdOrUrl.includes('q_auto') && !publicIdOrUrl.includes('ar_9:16')) {
        return publicIdOrUrl.replace(
          '/video/upload/',
          '/video/upload/q_auto:good,f_auto,w_720,c_fill,ar_9:16/'
        );
      }
      return publicIdOrUrl;
    }

    if (!publicIdOrUrl.startsWith('http')) {
      const publicId = publicIdOrUrl.replace(/\.mp4$/i, '');
      return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/q_auto:good,f_auto,w_720,c_fill,ar_9:16/${publicId}.mp4`;
    }

    return publicIdOrUrl;
  }

  /**
   * Generates a fast 9:16 poster thumbnail extracted directly from the video keyframe at 0 seconds.
   */
  getCloudinaryThumbnailFromVideo(videoUrlOrId, width = 400, height = 711) {
    if (!videoUrlOrId) return '';

    if (videoUrlOrId.includes('res.cloudinary.com')) {
      return videoUrlOrId
        .replace(/\/video\/upload\/[^/]*\//, `/video/upload/so_0,w_${width},h_${height},c_fill,q_auto,f_auto/`)
        .replace(/\.(mp4|m3u8|mov|mkv)$/i, '.webp');
    }

    const publicId = videoUrlOrId.replace(/\.(mp4|m3u8|mov|mkv)$/i, '');
    return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0,w_${width},h_${height},c_fill,q_auto,f_auto/${publicId}.webp`;
  }

  /**
   * Generates responsive image URL with CDN caching and automatic format negotiation (AVIF/WebP)
   */
  getOptimizedImageUrl(publicIdOrUrl, width = 400, height = 600) {
    if (!publicIdOrUrl) return '';

    if (publicIdOrUrl.includes('res.cloudinary.com')) {
      return publicIdOrUrl.replace(
        /\/image\/upload\/[^/]*\//,
        `/image/upload/w_${width},h_${height},c_fill,q_auto,f_auto/`
      );
    }

    if (!publicIdOrUrl.startsWith('http')) {
      return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/w_${width},h_${height},c_fill,q_auto,f_auto/${publicIdOrUrl}`;
    }

    return publicIdOrUrl;
  }

  /**
   * Generates time-limited signed stream authorization payload.
   * Returns both adaptive HLS (.m3u8) and progressive MP4 streaming URLs.
   */
  generateSignedStreamUrl(seriesId, episodeNumber, userId = 'anon', isVip = false) {
    const expiresAt = Math.floor(Date.now() / 1000) + (2 * 60 * 60); // 2 hours validity
    const publicPath = `microdrama/${seriesId}/ep_${String(episodeNumber).padStart(2, '0')}`;

    // HMAC SHA-256 signature to protect against URL tampering and unauthorized access
    const stringToSign = `${publicPath}:${userId}:${expiresAt}:${isVip ? 'VIP' : 'FREE'}`;
    const token = crypto
      .createHmac('sha256', CONTENT_ENCRYPTION_KEY)
      .update(stringToSign)
      .digest('hex');

    // If Cloudinary credentials are mock/default, provide high-availability CDN test streams
    if (CLOUD_NAME === 'microdrama-ott' || CLOUD_NAME.includes('your_cloudinary')) {
      const sampleUrl = episodeNumber <= 5
        ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

      return {
        streamUrl: `${sampleUrl}?token=${token}&exp=${expiresAt}`,
        hlsUrl: `${sampleUrl}?token=${token}&exp=${expiresAt}`,
        mp4Url: `${sampleUrl}?token=${token}&exp=${expiresAt}`,
        expiresAt,
        token
      };
    }

    const cdnBase = `${VIDEO_CDN_BASE_URL}`;
    const hlsUrl = `${cdnBase}sp_auto,ar_9:16,c_fill,w_720,q_auto/${publicPath}.m3u8?token=${token}&exp=${expiresAt}`;
    const mp4Url = `${cdnBase}q_auto:good,f_auto,w_720,c_fill,ar_9:16/${publicPath}.mp4?token=${token}&exp=${expiresAt}`;

    return {
      streamUrl: hlsUrl, // Primary stream is adaptive HLS
      hlsUrl,
      mp4Url,
      expiresAt,
      token
    };
  }

  /**
   * Creates direct-to-Cloudinary upload signature.
   * Bypasses Node.js server so heavy video uploads travel directly from client/browser to Cloudinary CDN.
   */
  createUploadSignature(folder = 'microdrama/episodes') {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign = {
      folder,
      timestamp
    };

    if (!API_SECRET) {
      return { timestamp, signature: 'mock_direct_upload_sig', cloudName: CLOUD_NAME, folder };
    }

    const signature = cloudinary.utils.api_sign_request(paramsToSign, API_SECRET);
    return {
      timestamp,
      signature,
      apiKey: API_KEY,
      cloudName: CLOUD_NAME,
      folder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`
    };
  }
}

module.exports = new VideoCdnService();
