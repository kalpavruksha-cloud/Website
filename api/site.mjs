import { siteHandler } from '../src/cms/site.mjs';
export default { fetch: request => siteHandler(request) };
