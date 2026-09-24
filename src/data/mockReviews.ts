import { Review } from './types';
import { makeVenueKey } from '../utils/venue';

/**
 * Seeded reviews for a few hosts. Current demo user has none
 * (« vient d’arriver ») until they receive reviews.
 *
 * Person fields (rating / comment) never mix with venue fields
 * (venueRating / venueComment).
 */
export const mockReviews: Review[] = [
  {
    id: 'rev-1',
    outingId: 'outing-past-lea-1',
    fromUserId: 'demo-guest-1',
    toUserId: 'host-1',
    rating: 5,
    comment:
      'Léa est super accueillante, soirée fluide et sans pression. On a bien ri.',
    reply: 'Merci Juliette, hâte de croiser d’autres Chance !',
    venueRating: 5,
    venueComment: 'Trattoria cosy, pasta au top, service souriant.',
    venueKey: makeVenueKey('Trattoria du pont', 'Le Marais'),
    venueName: 'Trattoria du pont',
    createdAt: '2026-08-20T21:30:00.000Z',
  },
  {
    id: 'rev-2',
    outingId: 'outing-past-lea-2',
    fromUserId: 'host-5',
    toUserId: 'host-1',
    rating: 4,
    comment: 'Conversation facile, Léa met à l’aise tout de suite.',
    venueRating: 4,
    venueComment: 'Bonne adresse. Un peu bruyant mais top.',
    venueKey: makeVenueKey('Café Saint-Paul', 'Le Marais'),
    venueName: 'Café Saint-Paul',
    createdAt: '2026-09-01T22:00:00.000Z',
  },
  {
    id: 'rev-3',
    outingId: 'outing-past-nina-1',
    fromUserId: 'host-6',
    toUserId: 'host-2',
    rating: 5,
    comment: 'Nina connaît ses caves et guide la discussion avec douceur.',
    venueRating: 5,
    venueComment: 'Apéro vin nature parfait, sélection top.',
    venueKey: makeVenueKey('Cave du coin', 'Oberkampf'),
    venueName: 'Cave du coin',
    createdAt: '2026-08-28T20:15:00.000Z',
  },
  {
    id: 'rev-4',
    outingId: 'outing-past-thomas-1',
    fromUserId: 'host-1',
    toUserId: 'host-3',
    rating: 4,
    comment: 'Thomas est cool et à l’heure.',
    venueRating: 4,
    venueComment: 'Jazz sympa, bonne acoustique.',
    venueKey: makeVenueKey('Cave à jazz', 'Bastille'),
    venueName: 'Cave à jazz',
    createdAt: '2026-07-12T23:00:00.000Z',
  },
  {
    id: 'rev-5',
    outingId: 'outing-past-ines-1',
    fromUserId: 'host-4',
    toUserId: 'host-6',
    rating: 5,
    venueRating: 5,
    venueKey: makeVenueKey('Le Quai', 'Canal Saint-Martin'),
    venueName: 'Le Quai',
    createdAt: '2026-09-05T21:00:00.000Z',
  },
];
