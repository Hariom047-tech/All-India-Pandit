const { makeMediaUpload } = require('./mediaUpload');

/**
 * Pandit profile photos and intro videos.
 * Thin configuration over the shared factory in mediaUpload.js.
 */
const pandit = makeMediaUpload('pandits', { allowVideo: true, maxMb: 60 });

module.exports = {
  handlePanditMediaUpload: pandit.handler,
  removeUploadedFile: pandit.removeFile,
  isVideo: pandit.isVideo,
  MAX_BYTES: pandit.limitMb * 1024 * 1024,
};
