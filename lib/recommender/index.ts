export { recommend }              from './recommend';
export { filterEligible, isEligible } from './eligibility';
export { ContentBasedScorer, computeBiasPrior } from './scorer';
export { rerank, classifyProtectedGroup, computeEqualOpportunityGap } from './reranker';
export type {
  RecommenderProfile,
  FairnessMode,
  RecommendOptions,
  RecommendResult,
  ScoredItem,
  Scorer,
  ScorerResult,
} from './types';
