import { Review } from './types';

/**
 * Seeded reviews for a few hosts. Current demo user has none
 * (« vient d’arriver ») until they receive reviews.
 */
export const mockReviews: Review[] = [
  {
    id: 'rev-1',
    outingId: 'outing-past-lea-1',
    fromUserId: 'demo-guest-1',
    toUserId: 'host-1',
    rating: 5,
    comment: 'Léa est super accueillante, soirée fluide et sans pression. On a bien ri.',
    reply: 'Merci Juliette, hâte de croiser d’autres Chance !',
    createdAt: '2026-08-20T21:30:00.000Z',
  },
  {
    id: 'rev-2',
    outingId: 'outing-past-lea-2',
    fromUserId: 'host-5',
    toUserId: 'host-1',
    rating: 4,
    comment: 'Bonne adresse, conversation facile. Un peu bruyant mais top.',
    createdAt: '2026-09-01T22:00:00.000Z',
  },
  {
    id: 'rev-3',
    outingId: 'outing-past-nina-1',
    fromUserId: 'host-6',
    toUserId: 'host-2',
    rating: 5,
    comment: 'Apéro vin nature parfait. Nina connaît ses caves.',
    createdAt: '2026-08-28T20:15:00.000Z',
  },
  {
    id: 'rev-4',
    outingId: 'outing-past-thomas-1',
    fromUserId: 'host-1',
    toUserId: 'host-3',
    rating: 4,
    comment: 'Jazz sympa, Thomas est cool et à l’heure.',
    createdAt: '2026-07-12T23:00:00.000Z',
  },
  {
    id: 'rev-5',
    outingId: 'outing-past-ines-1',
    fromUserId: 'host-4',
    toUserId: 'host-6',
    rating: 5,
    createdAt: '2026-09-05T21:00:00.000Z',
  },
];
