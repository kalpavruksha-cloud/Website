# Activate the Kalpavruksha team editor

The editing interface is at **`/admin`** on the website. It supports page text,
search titles and descriptions, replacement images, gallery photographs,
testimonials and team profiles. Its layout follows the existing website theme.

The website works before activation. Editing remains locked until private storage
and two passwords are configured. No default passwords are included in the code.

## One-time Vercel setup

No Codex integration is needed for this option. Open
[the Website project](https://vercel.com/kalpavruksha-clouds-projects/website)
directly in Vercel. The website's `/admin` screen shows a configuration checklist
and a **Check activation** button. Set the values inside Vercel; do not send
passwords or tokens through chat.

1. Open the **Website** project in Vercel. In **Storage**, create and connect a
   **private Vercel Blob store**. Connect it to the environment your team will use
   (normally Production). The integration supplies `BLOB_READ_WRITE_TOKEN`.
   A public Blob store is not suitable for private team drafts.
2. In project **Settings → Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `CMS_EDITOR_PASSWORD` | A long, random password for teammates |
   | `CMS_OWNER_PASSWORD` | A different long, random password kept by the owner |

   Each password must contain at least 16 characters. Use a password manager to
   generate and share them. These are server environment variables; never put
   them in source code, a browser script, a Git commit, or a public message.
3. **Redeploy** the latest GitHub commit after adding the store and variables.
   Open `/admin`, enter your name and the owner password, and sign in. Names
   identify changes in the history; access is controlled by the shared passwords.

Share the Vercel website link and the **team password** with your team using a
private channel. Keep the owner password separate. Sessions expire after eight
hours; changing either password invalidates existing sessions.

If using Preview deployments, connect their environment to the intended store
and configure the passwords there too. Deployments connected to the **same store
share content**. Use a different private store when a separate preview dataset is
needed. Drafts and published content are not tied to a particular Git commit.

## Edit and review

1. Choose a page from **Page to edit**. Click text or an image in the preview, or
   select a field from the sidebar. Text stays plain text and preserves the page's
   layout. Choose **Site-wide header, footer & logos** for shared text, navigation
   labels and logos. Clicking shared content opens these settings. Existing link
   destinations and page layouts are preserved.
2. Use **Images** to upload PNG, JPEG or WebP files, up to **3 MB each**. Write a
   useful image description and choose the crop focus. SVG uploads are disabled;
   the original approved logo assets are retained.
3. On **Gallery**, choose **Entries** to add, caption, reorder or remove photos.
   Select the business category. Keep concept/stock images marked illustrative.
   Verified company photographs can have that label cleared.
4. On **Our Team**, choose **Entries** to add real names, roles, business names,
   short introductions and optional portraits. Obtain permission and mark each
   profile reviewed before publishing. KV's team belongs to the independent
   collaborating company; describe that relationship accurately.
5. On **Testimonials**, enter genuine quotes, names and relationships. Record
   permission and mark a quote reviewed. Genuine entries need both flags to appear publicly. Three labelled photo
   templates are supplied in each collection for design review. Replace the photo
   and all details, then clear **Sample template**. A generated sample portrait
   cannot be published as an unlabelled genuine person.
6. Choose **Preview changes** to see edits in the browser, then **Save shared
   draft** to store them for teammates. Gallery, team and testimonial entries use
   **Preview changes** to refresh their layout. Add a short change note when useful.
7. Open **Review saved website** to browse the team's latest saved drafts with a
   clear review banner. This view requires sign-in. The owner signs in with the owner password and chooses **Publish saved draft**
   after reviewing. Publishing a collection also updates its homepage preview.
   Use **Publish reviewed website** to publish all pending saved drafts together,
   or publish pages individually. If a teammate saves during this step, review the
   latest drafts before retrying.

Saving a draft does not change the public page. The preview shows the latest saved
draft collections from other pages, while public pages use published collections.
Two teammates can review together; if another save occurs first, a stale save is
rejected. Download your work before reloading to compare or reapply it.

## History and backups

The owner can open **History** and restore a recent version as a new draft, or
restore the original page. Review and publish the restored draft to change the
website. The editor retains up to 20 previous versions per page.

**Download draft** exports a JSON backup for the selected page. Keep regular
backups of the Blob store's `cms/state.json` and referenced `cms/media/` files;
downloaded page JSON does not contain the image bytes. There is no automatic JSON
import in this version. Keep `cms/state.json` when redeploying: it holds your
shared content independently of the source templates.

Uploads stay private until used by published page images, gallery entries or
approved team/testimonial profiles, or clearly labelled sample cards. Removing a public reference revokes unauthenticated access
through the image endpoint. Old uploads and login-limit records are retained in
the private store; the owner can periodically clean records no longer referenced
by drafts, public pages or retained history. The editor does not delete files.

## Local development

Run `npm ci`, copy `.env.example` to `.env`, then set two distinct passwords and
`CMS_LOCAL_STORAGE=true` for a local editor. Run `npm run dev` and visit
`http://localhost:3000/admin`. The `.env` file and `.cms-data/` folder are ignored
by Git. Local storage is explicitly disabled on Vercel and in production; use
private Blob there. Do not use a production token to experiment with local edits.

## Troubleshooting

- **One-time activation is needed:** verify the private store token and both
  distinct passwords exist in the current deployment environment, then redeploy.
- **Shared content service unavailable:** check the store connection and Vercel
  Function logs. Browser changes remain unsaved. The site reports unavailable
  content rather than silently substituting the original content.
- **Another teammate saved changes:** download your draft, reload the latest
  version and reapply the relevant edits. A template update can also require a
  reload because the editable fields have changed.
- **Updates do not appear publicly:** save first, then have the owner publish the
  page. Collection previews depend on their own published Gallery, Team or
  Testimonials page. Refresh the public page after publication.

Verified contact-delivery details are still pending. The contact form is separate
from this editor and remains disabled on Vercel until its email integration is
configured.
