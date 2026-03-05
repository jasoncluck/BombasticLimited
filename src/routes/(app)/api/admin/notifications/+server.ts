import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { supabase } }) => {
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (!claimsData?.claims || claimsError) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Get user profile to check admin status
  const { data: userProfile, error: profileError } = await supabase
    .from('profiles')
    .select('account_type')
    .eq('id', claimsData.claims.sub)
    .single();

  if (profileError || !userProfile || userProfile.account_type !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Get all system notifications for admin management
  // We'll sort them after fetching since we need custom logic
  const { data: allNotifications, error: notificationError } = await supabase
    .from('notifications')
    .select('*')
    .eq('type', 'system');

  if (notificationError) {
    console.error('Error fetching notifications:', notificationError);
    return json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }

  // Categorize notifications by their status
  const now = new Date();
  const notifications = allNotifications ?? [];

  const pendingNotifications = notifications.filter((n) => {
    if (!n.start_datetime) return false;
    const startDate = new Date(n.start_datetime);
    return startDate > now;
  });

  const sentNotifications = notifications.filter((n) => {
    const startDate = n.start_datetime ? new Date(n.start_datetime) : null;
    const endDate = n.end_datetime ? new Date(n.end_datetime) : null;

    const hasStarted = !startDate || startDate <= now;
    const hasNotExpired = !endDate || endDate > now;

    return hasStarted && hasNotExpired;
  });

  const expiredNotifications = notifications.filter((n) => {
    if (!n.end_datetime) return false;
    const endDate = new Date(n.end_datetime);
    return endDate <= now;
  });

  // Sort pending notifications by start_datetime (earliest first)
  const sortedPendingNotifications = pendingNotifications.sort((a, b) => {
    const startA = new Date(a.start_datetime!);
    const startB = new Date(b.start_datetime!);
    return startA.getTime() - startB.getTime(); // Ascending - earliest start time first
  });

  // Sort sent notifications by effective date (start_datetime if exists, otherwise created_at)
  const sortedSentNotifications = sentNotifications.sort((a, b) => {
    const getEffectiveDate = (notification: typeof a) => {
      return notification.start_datetime || notification.created_at;
    };

    const dateA = new Date(getEffectiveDate(a));
    const dateB = new Date(getEffectiveDate(b));

    return dateB.getTime() - dateA.getTime(); // Descending - most recent first
  });

  // Sort expired notifications by end_datetime (most recently expired first)
  const sortedExpiredNotifications = expiredNotifications.sort((a, b) => {
    const endA = new Date(a.end_datetime!);
    const endB = new Date(b.end_datetime!);
    return endB.getTime() - endA.getTime(); // Descending - most recently expired first
  });

  // Get system logs
  const { data: systemLogs, error: logsError } = await supabase
    .from('system_logs')
    .select('*')
    .in('event_type', [
      'notification_removed',
      'notification_cleanup',
      'user_notification_dismissed',
    ])
    .order('created_at', { ascending: false })
    .limit(10);

  if (logsError) {
    console.error('Error fetching system logs:', logsError);
  }

  const result = {
    pendingNotifications: sortedPendingNotifications,
    sentNotifications: sortedSentNotifications,
    expiredNotifications: sortedExpiredNotifications,
    systemLogs: systemLogs || [],
    timestamp: new Date().toISOString(),
  };

  return json(result);
};
