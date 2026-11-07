import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/Layout';
import { AdminLayout } from './components/AdminLayout';
import { HomePage } from './pages/Home';
import { SeasonsPage } from './pages/Seasons';
import { SeasonDetailPage } from './pages/SeasonDetail';
import { RegisterPage } from './pages/Register';
import { MatchesPage } from './pages/Matches';
import { MatchDetailPage } from './pages/MatchDetail';
import { LeaderboardPage } from './pages/Leaderboard';
import { PlayerPage } from './pages/Player';
import { AnnouncementsPage, AnnouncementDetailPage } from './pages/Announcements';
import { LoginPage } from './pages/Login';
import { AuthCallbackPage } from './pages/AuthCallback';
import { MePage } from './pages/Me';
import { NotificationsPage } from './pages/Notifications';
import { TeamsPage } from './pages/Teams';
import { AppealsPage } from './pages/Appeals';
import { NotFoundPage } from './pages/NotFound';
import { AdminOverviewPage } from './pages/admin/Overview';
import { AdminUsersPage } from './pages/admin/Users';
import { AdminSeasonsPage } from './pages/admin/Seasons';
import { AdminSeasonEditPage } from './pages/admin/SeasonEdit';
import { AdminRegistrationsPage } from './pages/admin/Registrations';
import { AdminMatchesPage } from './pages/admin/Matches';
import { AdminMatchReviewPage } from './pages/admin/MatchReview';
import { AdminPointsPage } from './pages/admin/Points';
import { AdminLeaderboardPage } from './pages/admin/Leaderboard';
import { AdminTeamsPage } from './pages/admin/Teams';
import { AdminAppealsPage } from './pages/admin/Appeals';
import { AdminAnnouncementsPage } from './pages/admin/Announcements';
import { AdminNotificationsPage } from './pages/admin/Notifications';
import { AdminSmtpPage } from './pages/admin/Smtp';
import { AdminServersPage } from './pages/admin/Servers';
import { AdminFilesPage } from './pages/admin/Files';
import { AdminAuditPage } from './pages/admin/Audit';
import { AdminSettingsPage } from './pages/admin/Settings';

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<HomePage />} />
        <Route path="seasons" element={<SeasonsPage />} />
        <Route path="seasons/:id" element={<SeasonDetailPage />} />
        <Route path="matches" element={<MatchesPage />} />
        <Route path="matches/:id" element={<MatchDetailPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="players/:id" element={<PlayerPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="announcements/:id" element={<AnnouncementDetailPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="auth/callback" element={<AuthCallbackPage />} />
        <Route path="me" element={<MePage />} />
        <Route path="me/notifications" element={<NotificationsPage />} />
        <Route path="me/teams" element={<TeamsPage />} />
        <Route path="me/appeals" element={<AppealsPage />} />
        <Route path="seasons/:id/register" element={<RegisterPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminOverviewPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="seasons" element={<AdminSeasonsPage />} />
        <Route path="seasons/:id" element={<AdminSeasonEditPage />} />
        <Route path="registrations" element={<AdminRegistrationsPage />} />
        <Route path="matches" element={<AdminMatchesPage />} />
        <Route path="matches/:id" element={<AdminMatchReviewPage />} />
        <Route path="points" element={<AdminPointsPage />} />
        <Route path="leaderboard" element={<AdminLeaderboardPage />} />
        <Route path="teams" element={<AdminTeamsPage />} />
        <Route path="appeals" element={<AdminAppealsPage />} />
        <Route path="announcements" element={<AdminAnnouncementsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="smtp" element={<AdminSmtpPage />} />
        <Route path="servers" element={<AdminServersPage />} />
        <Route path="files" element={<AdminFilesPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
      </Route>
    </Routes>
  );
}
