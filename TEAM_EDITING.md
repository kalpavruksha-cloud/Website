# Team website editing

Website: https://website-nine-beta-26.vercel.app/

Editor: https://website-nine-beta-26.vercel.app/admin

Saved-draft review: https://website-nine-beta-26.vercel.app/review

The owner must complete [EDITOR_SETUP.md](EDITOR_SETUP.md) once before team sign-in
and shared saving are available. Share the team password privately alongside the
editor link. The owner keeps the publishing password separate.

1. Open the editor and sign in with your name and the team password.
2. Choose any of the 26 pages. Click text or an image in the preview, or choose it
   from the Text / Images lists. Upload replacement photos up to 3 MB each.
3. Use **Site-wide header, footer & logos** for shared text, navigation labels and
   logos. Clicking shared content in a page preview opens these settings. Saved
   site-wide changes are used across every page; they take precedence over any
   earlier page-specific logo replacement.
4. On Gallery, Our Team or Testimonials, choose **Entries** to replace samples,
   add content, reorder items and upload portraits. Clear the sample checkbox
   after replacing the sample photo and details. Mark genuine entries reviewed
   and confirm permission to display them.
5. Click **Preview changes**, then **Save shared draft**. A successful save is
   stored in private server storage and is available to other signed-in teammates.
   Unsaved browser changes are not shared. Save before leaving or switching pages.
6. Open **Review saved website** to browse all saved drafts together, including
   site-wide changes. The gold review banner distinguishes drafts from the public
   website. Review access requires the same sign-in. Public visitors continue to
   see the last published version.
7. If another teammate saves first, download your draft, reload the newest shared
   version and reapply the relevant changes. A stale save cannot overwrite theirs.
8. When review is complete, the owner signs in with the owner password, reviews
   and uses **Publish reviewed website** to publish all pending saved drafts
   together, or publishes individual pages and site-wide settings. History can restore
   earlier versions as drafts for review before publication.

Content editing preserves the page layouts and existing link destinations. Team
members can change the displayed navigation labels, page text, dates, captions,
photos, logos and collection entries. Adding routes or restructuring page layouts
remains a source-code change.

The Vercel project must retain its private Blob store across deployments. The
store holds draft and published content independently of GitHub deployments.
