// Re-export parameter types for api-client usage
export type RegisterData = {
  email: string;
  password: string;
  username: string;
  fullName: string;
};

export type AssetListParams = {
  entityType?: string;
  platform?: string;
  domainId?: string;
  certificationStatus?: string;
  sensitivity?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export type SearchParams = {
  q: string;
  type?: string;
  platform?: string;
  from?: number;
  size?: number;
};

export type PolicyListParams = {
  policyType?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
};
