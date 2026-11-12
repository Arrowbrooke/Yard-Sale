window.YARD_SALE_CONFIG = {
  // Add the public URL and publishable key from this site's own Supabase project.
  // Never use a service_role or secret key here.
  supabaseUrl: 'https://kbiyuhxugkuofftmrkdc.supabase.co',
  supabaseKey: 'sb_publishable_Z-gH4ovBmap5sbCSyJ04hg_TxVBC4r9',
  // A dedicated, non-personal Supabase Auth account powers the password-only organizer login.
  organizerEmail: 'organizer@arrowbrooke-map.invalid',
  // Public half of the Web Push key pair. The private half lives only in
  // Supabase Edge Function secrets and is never shipped to visitors.
  vapidPublicKey: '',
  reverseGeocodeUrl: 'https://photon.komoot.io/reverse',
  addressSearchUrl: 'https://photon.komoot.io/api/',
  center: [33.2475, -96.9025],
  zoom: 16,
  // Simplified focus area traced from the organizer's preferred squared boundary.
  focusBoundary: [
    [33.25195, -96.90995],
    [33.25195, -96.89415],
    [33.23910, -96.89415],
    [33.24025, -96.90995]
  ],
  // Approximate centerline of Frontier Parkway from west to east. The fog edge
  // is generated from this alignment, then moved north by the offset below.
  frontierAlignment: [
    [33.25170, -96.90995],
    [33.25167, -96.90710],
    [33.25153, -96.90310],
    [33.25139, -96.89925],
    [33.25122, -96.89645],
    [33.25108, -96.89415]
  ],
  fm1385Alignment: [
    [33.25108, -96.89415],
    [33.24875, -96.89415],
    [33.24615, -96.89415],
    [33.24355, -96.89415],
    [33.24115, -96.89415],
    [33.23945, -96.89415]
  ],
  southernAlignment: [
    [33.23945, -96.89415],
    [33.23945, -96.89710],
    [33.23952, -96.89975],
    [33.23962, -96.90145],
    [33.23974, -96.90185],
    [33.24012, -96.90210],
    [33.24030, -96.90245],
    [33.24034, -96.90510],
    [33.24034, -96.90765],
    [33.24025, -96.90995]
  ],
  winnRidgeAlignment: [
    [33.24025, -96.90995],
    [33.24255, -96.90988],
    [33.24505, -96.90976],
    [33.24765, -96.90967],
    [33.25005, -96.90973],
    [33.25170, -96.90995]
  ],
  fogRoadOffsetMeters: 18,
  fogEdgeWanderMeters: 4.5,
  // Common area southwest of Morning Ridge Trail and ArrowBrooke Avenue.
  gp2Location: [33.24991, -96.90508],
  // Common area previously represented by the non-home 2121 Aurora Lane point.
  gp3Location: [33.2414618, -96.9063994],
  eventDate: '2026-11-14'
};
