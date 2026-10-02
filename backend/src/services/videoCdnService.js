/**
 * StoryUp OTT - Video CDN & Cloudinary Media Streaming Architecture
 * 
 * Features:
 * - Direct Cloudinary Video & Image Integration
 * - 9:16 Mobile Vertical Optimization (ar_9:16, q_auto, f_auto, w_720)
 * - Automatic Video Poster & Thumbnail Extraction (so_0, jpg/webp)
 * - HMAC Tokenized Stream URL Protection
 */

const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'storyup-ott';
const API_KEY = process.env.CLOUDINARY_API_KEY || '';
const API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
const VIDEO_CDN_BASE_URL = process.env.VIDEO_CDN_BASE_URL || `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/`;
const CONTENT_ENCRYPTION_KEY = process.env.CONTENT_ENCRYPTION_KEY || 'storyup_aes_256_content_key_32bytes!';

// Initialize Cloudinary
if (CLOUD_NAME && API_KEY && API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true
  });
  console.log(`[Cloudinary] Configured for cloud: ${CLOUD_NAME}`);
}

class VideoCdnService {
  /**
   * Generates a Cloudinary optimized 9:16 vertical video streaming URL.
   * Uses on-the-fly transformations for ultra-fast mobile buffer times.
   */
  getCloudinaryOptimizedUrl(urlOrPublicId) {
    if (!urlOrPublicId) return '';

    // If it's already a full Cloudinary URL without transformation, insert standard 9:16 vertical params
    if (urlOrPublicId.includes('res.cloudinary.com') && urlOrPublicId.includes('/video/upload/')) {
      if (!urlOrPublicId.includes('q_auto') && !urlOrPublicId.includes('ar_9:16')) {
        return urlOrPublicId.replace(
          '/video/upload/',
          '/video/upload/q_auto,f_auto,w_720,c_fill,ar_9:16/'
        );
      }
      return urlOrPublicId;
    }

    // If it's a public ID, construct the full Cloudinary CDN URL
    if (!urlOrPublicId.startsWith('http')) {
      return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/q_auto,f_auto,w_720,c_fill,ar_9:16/${urlOrPublicId}.mp4`;
    }

    return urlOrPublicId;
  }

  /**
   * Generates a 9:16 vertical thumbnail poster directly from a Cloudinary video.
   */
  getCloudinaryThumbnailFromVideo(videoUrlOrId) {
    if (!videoUrlOrId) return '';

    if (videoUrlOrId.includes('res.cloudinary.com')) {
      // Replace /video/upload/ with /video/upload/so_0,w_600,h_1067,c_fill,q_auto,f_auto/ and .mp4 with .jpg
      return videoUrlOrId
        .replace(/\/video\/upload\/[^/]*\//, '/video/upload/so_0,w_600,h_1067,c_fill,q_auto,f_auto/')
        .replace(/\.(mp4|m3u8|mov|mkv)$/i, '.jpg');
    }

    return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0,w_600,h_1067,c_fill,q_auto,f_auto/${videoUrlOrId}.jpg`;
  }

  /**
   * Generates an authorized, time-limited signed URL for video playback.
   */
  generateSignedStreamUrl(seriesId, episodeNumber, userId, isVip = false) {
    const expiresAt = Math.floor(Date.now() / 1000) + (2 * 60 * 60); // Valid for 2 hours
    const path = `${seriesId}/ep_${String(episodeNumber).padStart(2, '0')}`;

    // Generate HMAC signature
    const stringToSign = `${path}:${userId}:${expiresAt}:${isVip ? 'VIP' : 'FREE'}`;
    const token = crypto
      .createHmac('sha256', CONTENT_ENCRYPTION_KEY)
      .update(stringToSign)
      .digest('hex');

    // Return Cloudinary or Sample stream URL
    if (VIDEO_CDN_BASE_URL.includes('your_cloudinary_cloud_name') || VIDEO_CDN_BASE_URL.includes('example.com')) {
      const sampleUrl = episodeNumber <= 5
        ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        : 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
      return `${sampleUrl}?token=${token}&exp=${expiresAt}`;
    }

    const cdnUrl = `${VIDEO_CDN_BASE_URL}q_auto,f_auto,w_720,c_fill,ar_9:16/${path}.mp4`;
    return `${cdnUrl}?token=${token}&exp=${expiresAt}`;
  }

  /**
   * Creates upload signature for direct browser uploads to Cloudinary
   */
  createUploadSignature(folder = 'storyup/episodes') {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign = {
      folder,
      timestamp
    };

    if (!API_SECRET) {
      return { timestamp, signature: 'demo_signature', cloudName: CLOUD_NAME };
    }

    const signature = cloudinary.utils.api_sign_request(paramsToSign, API_SECRET);
    return {
      timestamp,
      signature,
      apiKey: API_KEY,
      cloudName: CLOUD_NAME,
      folder
    };
  }
}

module.exports = new VideoCdnService();
