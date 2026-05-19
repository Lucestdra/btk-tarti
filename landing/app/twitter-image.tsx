// Twitter card reuses the same image as OpenGraph — Next.js requests
// `/twitter-image` separately, so keep explicit metadata exports here
// instead of re-exporting `runtime` (Next cannot statically detect that).

import Image, { alt, size, contentType } from "./opengraph-image";

export const runtime = "edge";
export { alt, size, contentType };
export default Image;
