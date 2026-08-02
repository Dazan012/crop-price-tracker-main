import { render, screen } from '@testing-library/react';
import Landing from './Landing';

jest.mock('../services/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }),
}));

jest.mock('../services/api', () => ({
  dashboardAPI: {
    stats: jest.fn().mockResolvedValue({ data: { total_entries: 3, total_markets: 2, total_crops: 1, total_regions: 1 } }),
  },
  dataAPI: {
    crops: jest.fn().mockResolvedValue({ data: [{ id: 1, name: 'Maize' }, null] }),
    regions: jest.fn().mockResolvedValue({ data: [{ id: 1, name: 'Mbeya' }, null] }),
  },
  priceAPI: {
    list: jest.fn().mockResolvedValue({ data: [null, { crop_name: 'Maize', market_name: 'Mbeya', price: 5000, price_date: '2026-06-26' }] }),
    heatmap: jest.fn().mockResolvedValue({ data: { crops: ['Maize', null], regions: [{ name: 'Mbeya', prices: { Maize: { price: 5000, tier: 'mid' } } }] } }),
  },
}));

describe('Landing', () => {
  it('renders without crashing when price entries contain null values', async () => {
    render(<Landing />);

    expect(await screen.findByText(/Smart Crops/i)).toBeInTheDocument();
  });
});
