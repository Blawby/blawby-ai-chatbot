import {
  ShieldCheckIcon,
  QuestionMarkCircleIcon,
  ArrowTopRightOnSquareIcon
} from "@heroicons/react/24/outline";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/shared/ui/Accordion';

interface PrivacySupportSidebarProps {
  className?: string;
}

const PrivacySupportSidebar = ({ className }: PrivacySupportSidebarProps) => {

  return (
    <Accordion type="single" collapsible className={className}>
      <AccordionItem value="privacy-support-section">
        <AccordionTrigger>Privacy & Support</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-2">
            <a
              href="https://blawby.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-accent dark:hover:text-accent transition-colors duration-200"
            >
              <ShieldCheckIcon className="w-4 h-4" />
              Privacy Policy
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
            <a
              href="https://blawby.com/help"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-accent dark:hover:text-accent transition-colors duration-200"
            >
              <QuestionMarkCircleIcon className="w-4 h-4" />
              Help & Support
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default PrivacySupportSidebar; 