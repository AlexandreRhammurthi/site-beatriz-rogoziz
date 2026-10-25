window.STUDIO_B_SUPABASE = {
  url: "https://exqprqsnxdyzonkjippe.supabase.co",
  publishableKey: "sb_publishable_ouum5mWYL2DQ-nw9q76tqg_Q97Pv04s"
};

window.createStudioSupabaseClient = () => {
  const settings = window.STUDIO_B_SUPABASE;
  if (!settings?.url || !settings?.publishableKey || !window.supabase?.createClient) return null;
  return window.supabase.createClient(settings.url, settings.publishableKey);
};
