export interface Lead {
  companyName: string;
  contactName?: string;
  role?: string;
  email: string;
  website: string;
  chatbotStatus: 'OPORTUNIDAD' | 'TIENE_CHATBOT';
  needScore: number;
  reason: string;
  socialLinks: string[];
}

export interface AnalysisStats {
  total: number;
  opportunities: number;
  highPriority: number;
}