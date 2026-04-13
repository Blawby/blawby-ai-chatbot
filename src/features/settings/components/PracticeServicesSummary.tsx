interface PracticeServicesSummaryProps {
 services: string[];
}

export const PracticeServicesSummary = ({ services }: PracticeServicesSummaryProps) => {
 if (services.length === 0) {
  return null;
 }

 return (
  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-input-placeholder">
   {services.map((service, index) => (
    <li key={index}>{service}</li>
   ))}
  </ul>
 );
};
