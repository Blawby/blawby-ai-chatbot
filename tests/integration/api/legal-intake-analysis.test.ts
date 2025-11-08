import { describe, it, expect } from 'vitest';

interface MockAnalysis {
  summary?: string;
  key_facts?: string[];
  entities?: {
    people?: string[];
    orgs?: string[];
    dates?: string[];
  };
  action_items?: string[];
  confidence?: number;
}

// Test version of the analysis logic without file retrieval
function testHandleAnalyzeDocument(analysis_type: string, mockAnalysis: MockAnalysis) {
  // Extract key information for legal intake
  const parties = mockAnalysis.entities?.people || [];
  const organizations = mockAnalysis.entities?.orgs || [];
  const dates = mockAnalysis.entities?.dates || [];
  const keyFacts = mockAnalysis.key_facts || [];
  
  // Determine likely matter type based on document analysis
  let suggestedMatterType = 'General Consultation';
  if (analysis_type === 'contract' || mockAnalysis.summary?.toLowerCase().includes('contract')) {
    suggestedMatterType = 'Contract Review';
  } else if (analysis_type === 'medical_document' || mockAnalysis.summary?.toLowerCase().includes('medical')) {
    suggestedMatterType = 'Personal Injury';
  } else if (analysis_type === 'government_form' || mockAnalysis.summary?.toLowerCase().includes('form')) {
    suggestedMatterType = 'Administrative Law';
  } else if (analysis_type === 'image' && (mockAnalysis.summary?.toLowerCase().includes('accident') || mockAnalysis.summary?.toLowerCase().includes('injury'))) {
    suggestedMatterType = 'Personal Injury';
  } else if (analysis_type === 'image' && mockAnalysis.summary?.toLowerCase().includes('property')) {
    suggestedMatterType = 'Property Law';
  }
  
  // Build legally-focused response
  let response = '';
  response += `I've analyzed your document and here's what I found:\n\n`;
  
  // Document identification
  if (mockAnalysis.summary) {
    response += `**Document Analysis:** ${mockAnalysis.summary}\n\n`;
  }
  
  // Key legal details
  if (parties.length > 0) {
    response += `**Parties Involved:** ${parties.join(', ')}\n`;
  }
  
  if (organizations.length > 0) {
    response += `**Organizations:** ${organizations.join(', ')}\n`;
  }
  
  if (dates.length > 0) {
    response += `**Important Dates:** ${dates.join(', ')}\n`;
  }
  
  if (keyFacts.length > 0) {
    response += `**Key Facts:**\n`;
    keyFacts.slice(0, 3).forEach(fact => {
      response += `• ${fact}\n`;
    });
  }
  
  response += `\n**Suggested Legal Matter Type:** ${suggestedMatterType}\n\n`;
  
  // Legal guidance and next steps
  response += `Based on this analysis, I can help you:\n`;
  response += `• Create a legal matter for attorney review\n`;
  response += `• Identify potential legal issues or concerns\n`;
  response += `• Determine appropriate legal services needed\n`;
  response += `• Prepare for consultation with an attorney\n\n`;
  
  // Call to action
  response += `Would you like me to create a legal matter for this ${suggestedMatterType.toLowerCase()} case? I'll need your contact information to get started.`;
  
  return {
    success: true,
    message: response,
    analysis: {
      ...mockAnalysis,
      suggestedMatterType,
      parties,
      organizations,
      dates,
      keyFacts
    }
  };
}

describe('Legal Intake Document Analysis', () => {
  it('should analyze legal documents and suggest matter types', async () => {
    const mockAnalysis = {
      summary: "This appears to be an IRS Form 501(c)(3) application for nonprofit status",
      key_facts: [
        "Organization seeking tax-exempt status",
        "Application filed for charitable organization",
        "Requires IRS review and approval"
      ],
      entities: {
        people: ["John Smith", "Jane Doe"],
        orgs: ["Community Foundation Inc"],
        dates: ["2024-01-15", "2024-03-01"]
      },
      action_items: [
        "Review application completeness",
        "Verify supporting documentation",
        "Monitor IRS response timeline"
      ],
      confidence: 0.85
    };

    const result = testHandleAnalyzeDocument('legal_document', mockAnalysis);

    expect(result.success).toBe(true);
    expect(result.message).toContain('I\'ve analyzed your document and here\'s what I found');
    expect(result.message).toContain('**Document Analysis:** This appears to be an IRS Form 501(c)(3) application');
    expect(result.message).toContain('**Parties Involved:** John Smith, Jane Doe');
    expect(result.message).toContain('**Organizations:** Community Foundation Inc');
    expect(result.message).toContain('**Important Dates:** 2024-01-15, 2024-03-01');
    expect(result.message).toContain('**Suggested Legal Matter Type:** Administrative Law');
    expect(result.message).toContain('Would you like me to create a legal matter for this administrative law case?');
    expect(result.analysis.suggestedMatterType).toBe('Administrative Law');
  });

  it('should analyze contracts and suggest contract review matter type', async () => {
    const mockAnalysis = {
      summary: "This is an employment contract between ABC Corp and John Smith",
      key_facts: [
        "Two-year employment agreement",
        "Salary of $75,000 annually",
        "Non-compete clause included"
      ],
      entities: {
        people: ["John Smith"],
        orgs: ["ABC Corp"],
        dates: ["2024-01-01", "2026-01-01"]
      },
      action_items: [
        "Review non-compete terms",
        "Verify salary and benefits",
        "Check termination clauses"
      ],
      confidence: 0.92
    };

    const result = testHandleAnalyzeDocument('contract', mockAnalysis);

    expect(result.success).toBe(true);
    expect(result.message).toContain('**Suggested Legal Matter Type:** Contract Review');
    expect(result.analysis.suggestedMatterType).toBe('Contract Review');
  });

  it('should analyze medical documents and suggest personal injury matter type', async () => {
    const mockAnalysis = {
      summary: "Medical bill and treatment records for car accident injury",
      key_facts: [
        "Emergency room visit on 2024-02-15",
        "Treatment for whiplash and back pain",
        "Total medical costs: $8,500"
      ],
      entities: {
        people: ["Patient Name"],
        orgs: ["City General Hospital"],
        dates: ["2024-02-15", "2024-02-20"]
      },
      action_items: [
        "Document all medical expenses",
        "Track ongoing treatment",
        "Consider legal action for compensation"
      ],
      confidence: 0.88
    };

    const result = testHandleAnalyzeDocument('medical_document', mockAnalysis);

    expect(result.success).toBe(true);
    expect(result.message).toContain('**Suggested Legal Matter Type:** Personal Injury');
    expect(result.analysis.suggestedMatterType).toBe('Personal Injury');
  });

  it('should analyze images and suggest appropriate matter type', async () => {
    const mockAnalysis = {
      summary: "Photographs showing property damage from water leak",
      key_facts: [
        "Extensive water damage to ceiling and walls",
        "Visible mold growth in affected areas",
        "Damage appears to be from upstairs unit"
      ],
      entities: {
        people: [],
        orgs: [],
        dates: []
      },
      action_items: [
        "Document all damage with photos",
        "Contact insurance company",
        "Consider legal action against responsible party"
      ],
      confidence: 0.75
    };

    const result = testHandleAnalyzeDocument('image', mockAnalysis);

    expect(result.success).toBe(true);
    expect(result.message).toContain('**Suggested Legal Matter Type:** Property Law');
    expect(result.analysis.suggestedMatterType).toBe('Property Law');
  });

  it('should handle government forms and suggest administrative law matter type', async () => {
    const mockAnalysis = {
      summary: "Department of Labor complaint form for wage violations",
      key_facts: [
        "Employee alleges unpaid overtime",
        "Complaint filed against former employer",
        "Seeking $15,000 in back wages"
      ],
      entities: {
        people: ["Complainant Name"],
        orgs: ["Former Employer Inc"],
        dates: ["2024-01-10"]
      },
      action_items: [
        "Gather employment records",
        "Document hours worked",
        "Prepare for DOL investigation"
      ],
      confidence: 0.90
    };

    const result = testHandleAnalyzeDocument('government_form', mockAnalysis);

    expect(result.success).toBe(true);
    expect(result.message).toContain('**Suggested Legal Matter Type:** Administrative Law');
    expect(result.analysis.suggestedMatterType).toBe('Administrative Law');
  });

  it('should provide fallback to general consultation for unknown document types', async () => {
    const mockAnalysis = {
      summary: "General business document with unclear legal implications",
      key_facts: [
        "Business proposal document",
        "Contains financial projections",
        "No clear legal issues identified"
      ],
      entities: {
        people: ["Business Owner"],
        orgs: ["Small Business LLC"],
        dates: ["2024-03-01"]
      },
      action_items: [
        "Review document for legal compliance",
        "Consider business structure implications",
        "Consult with legal professional"
      ],
      confidence: 0.60
    };

    const result = testHandleAnalyzeDocument('general', mockAnalysis);

    expect(result.success).toBe(true);
    expect(result.message).toContain('**Suggested Legal Matter Type:** General Consultation');
    expect(result.analysis.suggestedMatterType).toBe('General Consultation');
  });

  it('should include all extracted entities in the response', async () => {
    const mockAnalysis = {
      summary: "Legal document analysis",
      key_facts: ["Fact 1", "Fact 2"],
      entities: {
        people: ["John Doe", "Jane Smith"],
        orgs: ["ABC Corp", "XYZ LLC"],
        dates: ["2024-01-01", "2024-02-01"]
      },
      action_items: ["Action 1", "Action 2"],
      confidence: 0.80
    };

    const result = testHandleAnalyzeDocument('legal_document', mockAnalysis);

    expect(result.analysis.parties).toEqual(["John Doe", "Jane Smith"]);
    expect(result.analysis.organizations).toEqual(["ABC Corp", "XYZ LLC"]);
    expect(result.analysis.dates).toEqual(["2024-01-01", "2024-02-01"]);
    expect(result.analysis.keyFacts).toEqual(["Fact 1", "Fact 2"]);
  });
});
