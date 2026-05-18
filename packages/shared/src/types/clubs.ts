export type Division = 'fifth' | 'fourth' | 'third' | 'second' | 'first';

export interface Club {
  id: string;
  name: string;
  city: string;
  division: Division;
  prestige: number;
  budget: number;
  fanBase: number;
  cityTier: number;
  currentSeason: number;
}

export interface ClubSummary {
  id: string;
  name: string;
  division: Division;
  prestige: number;
}
