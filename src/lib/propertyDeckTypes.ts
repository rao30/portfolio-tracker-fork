export type PropertyDeckViewMode = 'deck' | 'table';
export type PropertyDeckInspectorTab = 'core' | 'financing' | 'expenses' | 'advanced';
export type PropertyDeckFinancingFilter = 'all' | 'seller' | 'conventional';

export interface PropertyDeckPreferences {
  viewMode: PropertyDeckViewMode;
  focusedIndex: number;
  inspectorTab: PropertyDeckInspectorTab;
  financingFilter: PropertyDeckFinancingFilter;
  searchQuery: string;
  mobileHintDismissed: boolean;
  updatedAt: string;
}
