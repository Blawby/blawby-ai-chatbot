/**
 * Welcome Step Component
 */

import { FeatureList } from '../components/FeatureList';
 
export function WelcomeStep() {
  const features = [
    {
      text: 'Configure your business profile and branding',
      variant: 'default' as const
    },
    {
      text: 'Set up services and custom intake questions',
      variant: 'default' as const
    },
    {
      text: 'Launch your AI-powered intake assistant',
      variant: 'default' as const
    }
  ];

  return (
    <div className="space-y-6">
      <FeatureList items={features} size="lg" />
    </div>
  );
}
