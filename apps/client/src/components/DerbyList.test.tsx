import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DerbyList } from '../components/DerbyList';
import { useLiveQuery } from 'dexie-react-hooks';

// Mock Dexie hook
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

// Mock DB access in component (though useLiveQuery mock handles the return)
vi.mock('../db', () => ({
  db: {
    derbies: {
      toArray: vi.fn(),
    },
  },
}));

describe('DerbyList', () => {
  it('renders empty state when no derbies exist', () => {
    (useLiveQuery as any).mockReturnValue([]);
    
    render(<DerbyList />);
    
    expect(screen.getByText('No derbies found.')).toBeInTheDocument();
    expect(screen.getByText('Start a new one or sync to find existing ones.')).toBeInTheDocument();
  });

  it('renders a list of derbies', () => {
    const mockDerbies = [
      { id: '1', name: 'Big Bass Bash', bodyOfWaterName: 'Lake Awesome' },
      { id: '2', name: 'Trout Scout', bodyOfWaterName: 'River Wild' },
    ];
    (useLiveQuery as any).mockReturnValue(mockDerbies);

    render(<DerbyList />);

    expect(screen.getByText('Big Bass Bash')).toBeInTheDocument();
    expect(screen.getByText('Lake Awesome')).toBeInTheDocument();
    expect(screen.getByText('Trout Scout')).toBeInTheDocument();
  });
});
