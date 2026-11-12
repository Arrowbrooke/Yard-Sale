# ArrowBrooke Yard Sale

Neighborhood yard sale map for Saturday, November 14, 2026. Adapted from Arrowbrooke/Halloween-Map. Uses the original verified address list, building footprints, neighborhood boundary, search, directions and organizer login.

Listings use public.yard_sales in the existing neighborhood Supabase project. Run yard-sale-setup.sql once in its SQL Editor. Do not run the legacy Halloween setup scripts. Household sale hours are entered in Central Time. Public visitors can list a verified home and remove their listing from the same browser; the organizer can edit or remove any sale.

Preview sample listings with ?demo=1. Sample listings are never saved to the database.

Residents may choose or take photos when adding a sale or return later using **Add photos to this sale** on its map listing. Any visitor can upload, including a spouse on a different phone; the site creates an anonymous session automatically. Each sale has five stored-photo slots total, counting approved and pending images. Uploading does not grant permission to edit or delete the sale or moderate photos. Images are resized to 1600 pixels and compressed to JPEG below 1 MB each. Pending photos are private. Each batch has a separate `sale_photo_reviews` entry and triggers a review notification. Only the organizer can approve or reject. Approving a later batch preserves earlier approved photos. Approved images use temporary signed URLs, and removing a listing removes its stored photos through the Storage API.

Run `yard-sale-photos.sql` once after the initial schema, then `yard-sale-notifications.sql` to reuse the existing server-side webhook. Deploy `notify-new-stop.ts` to the existing `notify-new-stop` Edge Function with its current secrets and JWT setting. Do not publish server secrets. New home and private photo-review alerts link to this Yard Sale site.

On iPhone, open the Yard Sale URL in Safari and add it to the Home Screen. Launch that installed app, sign in as organizer, and enable iPhone alerts. The organizer login persists on that device until sign-out or site data is cleared. The app uses an autumn leaf icon.

Map data: OpenFreeMap / OpenStreetMap; addresses: OpenAddresses / Denton County; supplemental buildings: Overture Maps (ODbL), including approximate display footprints where original data has none. See the source Halloween repository for preparation scripts.

Individual moderation: run yard-sale-photo-moderation.sql once after the photo schema. Each submission supports Select all, Approve selected and Deny selected. Approvals update only selected photos. Deny and Remove delete the files through the Storage API before completing the database change, so failed deletions remain retryable.

Run `yard-sale-later-photos.sql` after individual moderation to allow multiple photo batches and uploads from other visitors. `verify-later-photos.sql` checks different-visitor permissions, five-photo capacity, private pending photos, and preservation of earlier approvals in a rolled-back transaction.
