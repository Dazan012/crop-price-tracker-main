import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationBell from './NotificationBell';

const mockList = jest.fn();
const mockSummary = jest.fn();
const mockGetPreferences = jest.fn();

jest.mock('../services/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

jest.mock('../services/api', () => ({
  notificationAPI: {
    list: (...args) => mockList(...args),
    summary: (...args) => mockSummary(...args),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  },
  authAPI: {
    getPreferences: (...args) => mockGetPreferences(...args),
  },
}));

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPreferences.mockResolvedValue({ data: { notifications_enabled: true } });
    mockList.mockResolvedValue({ data: { notifications: [], unread_count: 0 } });
    mockSummary.mockResolvedValue({ data: { unread_count: 0 } });
  });

  it('shows the empty-state copy when the panel opens with no notifications', async () => {
    const user = userEvent.setup();
    render(<NotificationBell accentColor="#3b82f6" />);

    await user.click(screen.getByTitle(/notifications/i));

    expect(await screen.findByText('No notifications')).toBeInTheDocument();
    expect(screen.getByText(/You are all caught up/i)).toBeInTheDocument();
  });
});
