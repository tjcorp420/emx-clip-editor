const packageJson = require('./package.json');

const updateBaseUrl = String(process.env.EMX_UPDATE_BASE_URL || '').trim().replace(/\/+$/, '');
const allowInsecureLocalUpdateTest = process.env.EMX_ALLOW_INSECURE_LOCAL_UPDATE_TEST === '1';
const isLoopbackHttp = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/i.test(updateBaseUrl);
if (updateBaseUrl && !/^https:\/\//i.test(updateBaseUrl) && !(allowInsecureLocalUpdateTest && isLoopbackHttp)) {
  throw new Error('EMX_UPDATE_BASE_URL must be HTTPS. HTTP is allowed only for an explicit loopback smoke test.');
}

module.exports = {
  ...packageJson.build,
  extraMetadata: {
    emxRelease: {
      signing: packageJson.build?.win?.signExecutable === false ? 'unsigned build' : 'signing configuration unknown',
      updateChannel: String(process.env.EMX_UPDATE_CHANNEL || 'latest').trim() || 'latest'
    }
  },
  publish: updateBaseUrl ? [{
    provider: 'generic',
    url: updateBaseUrl,
    channel: String(process.env.EMX_UPDATE_CHANNEL || 'latest').trim() || 'latest'
  }] : undefined
};
