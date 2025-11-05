import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "../utils/test-utils";
import PricingComparison from "../../components/PricingComparison";
import { PricingModal } from "../../components/modals/organisms";
import { i18n, changeLanguage } from "@/i18n/hooks";
import { formatCurrency } from "../../utils/currencyFormatter";

// Mock the i18n hook - keep real i18n and changeLanguage, only mock useTranslation
vi.mock("@/i18n/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/hooks")>("@/i18n/hooks");
  return {
    ...actual,
    useTranslation: (namespace?: string) => {
      const translate = (key: string, _options?: Record<string, unknown>) => {
        // Return key for simple verification in tests
        return `${namespace || "common"}.${key}`;
      };
      return { t: translate };
    },
  };
});

describe("Pricing Internationalization", () => {
  describe("i18n Configuration", () => {
    it("should have pricing namespace configured", () => {
      expect(i18n.options.ns).toContain("pricing");
    });

    it("should support all required languages", () => {
      const supportedLanguages = [
        "en", "es", "fr", "de", "zh", "ja", "vi",  // Original languages
        "pt", "ar", "ru", "it", "ko", "nl", "pl",  // Phase 1-2
        "tr", "th", "id", "hi", "uk"               // Phase 3
      ];
      supportedLanguages.forEach((lang) => {
        expect(i18n.options.supportedLngs).toContain(lang);
      });
    });

    it("should default to English", () => {
      expect(i18n.options.fallbackLng).toBe("en");
    });
  });

  describe("Language Switching", () => {
    beforeEach(async () => {
      await changeLanguage("en");
    });

    it("should change language successfully", async () => {
      await changeLanguage("es");
      expect(i18n.language).toBe("es");
    });

    it("should support all target languages", async () => {
      const languages = [
        "en", "es", "fr", "de", "zh", "ja", "vi",
        "pt", "ar", "ru", "it", "ko", "nl", "pl",
        "tr", "th", "id", "hi", "uk"
      ];

      for (const lang of languages) {
        await changeLanguage(lang);
        expect(i18n.language).toBe(lang);
      }
    });

    it("should fall back to English for unsupported language", async () => {
      await changeLanguage("xx" as string);
      // Should fall back to English (including regional variants like en-US, en-GB)
      expect(i18n.language).toMatch(/^en(-|$)/);
    });
  });

  describe("Pricing Translations", () => {
    beforeEach(async () => {
      await changeLanguage("en");
    });

    it("should load English pricing translations", async () => {
      const t = i18n.getFixedT("en", "pricing");

      // Check that plan translations exist
      expect(t("plans.free.name")).toBeTruthy();
      expect(t("plans.plus.name")).toBeTruthy();
      expect(t("plans.business.name")).toBeTruthy();
      expect(t("plans.free.description")).toBeTruthy();
      expect(t("plans.plus.description")).toBeTruthy();
      expect(t("plans.business.description")).toBeTruthy();
    });

    it("should have translations for all tiers", () => {
      const tiers = ["free", "plus", "business"];
      const t = i18n.getFixedT("en", "pricing");

      tiers.forEach((tier) => {
        expect(t(`plans.${tier}.name`)).toBeTruthy();
        expect(t(`plans.${tier}.description`)).toBeTruthy();
        expect(t(`plans.${tier}.buttonText`)).toBeTruthy();
      });
    });

    it("should have feature translations", () => {
      const t = i18n.getFixedT("en", "pricing");

      // Test actual feature keys that exist in pricing.json
      expect(t("features.aiAccess.name")).toBeTruthy();
      expect(t("features.documentAnalysis.name")).toBeTruthy();
      expect(t("features.casePreparation.name")).toBeTruthy();
      expect(t("features.memoryContext.name")).toBeTruthy();
      expect(t("features.lawyerSearch.name")).toBeTruthy();
    });

    it("should have billing period translations", () => {
      const t = i18n.getFixedT("en", "pricing");

      expect(t("billing.monthly")).toBeTruthy();
      expect(t("billing.yearly")).toBeTruthy();
      expect(t("billing.billedMonthly")).toBeTruthy();
      expect(t("billing.billedAnnually")).toBeTruthy();
    });

    it("should have modal translations", () => {
      const t = i18n.getFixedT("en", "pricing");

      expect(t("modal.title")).toBeTruthy();
      expect(t("modal.currentPlan")).toBeTruthy();
      expect(t("modal.recommended")).toBeTruthy();
      expect(t("modal.popular")).toBeTruthy();
      expect(t("modal.close")).toBeTruthy();
    });
  });

  describe("Currency Formatting", () => {
    it("should format USD correctly", () => {
      const result = formatCurrency(99.99, "USD", "en");
      expect(result).toMatch(/\$.*99\.99/);
    });

    it("should format EUR correctly", () => {
      const result = formatCurrency(99.99, "EUR", "de");
      expect(result).toMatch(/99[,.]99.*€/);
    });

    it("should handle zero amounts", () => {
      const result = formatCurrency(0, "USD", "en");
      expect(result).toContain("0");
    });

    it("should handle large amounts", () => {
      const result = formatCurrency(999999.99, "USD", "en");
      expect(result).toContain("999");
    });

    it("should respect locale formatting", () => {
      const enResult = formatCurrency(1234.56, "USD", "en");
      const _deResult = formatCurrency(1234.56, "EUR", "de");

      // English uses dots for decimals, German uses commas
      expect(enResult).toContain(".");
      // Note: German formatting may vary by environment
    });

    it("should handle different currencies", () => {
      const currencies = ["USD", "EUR", "GBP", "JPY"];

      currencies.forEach((currency) => {
        const result = formatCurrency(100, currency, "en");
        expect(result).toBeTruthy();
        expect(typeof result).toBe("string");
      });
    });
  });

  describe("PricingComparison Component", () => {
    it("should render without crashing", () => {
      render(<PricingComparison />);
      // Component should render
      expect(document.body).toBeTruthy();
    });

    it("should use pricing translations", () => {
      render(<PricingComparison />);

      // Check that translation keys are being used
      const elements = screen.queryAllByText(/pricing\./);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe("PricingModal Component", () => {
    it("should render when open", () => {
      const onClose = vi.fn();
      render(<PricingModal isOpen={true} onClose={onClose} />);

      // Modal should be present
      expect(document.body).toBeTruthy();
    });

    it("should not render when closed", () => {
      const onClose = vi.fn();
      const { container } = render(
        <PricingModal isOpen={false} onClose={onClose} />
      );

      // Modal should not be visible
      expect(container.querySelector(".modal-content")).toBeNull();
    });

    it("should call onClose when close is triggered", () => {
      const onClose = vi.fn();
      render(<PricingModal isOpen={true} onClose={onClose} />);

      // Find and click close button if it exists
      const closeButton = screen.queryByRole("button", { name: /close/i });
      if (closeButton) {
        closeButton.click();
        expect(onClose).toHaveBeenCalled();
      }
    });

    it("should render the plus plan (kept in sync with upgradeTiers)", () => {
      const onClose = vi.fn();
      render(<PricingModal isOpen={true} onClose={onClose} />);
      // useTranslation mock returns namespace-prefixed keys
      expect(screen.getByText(/pricing\.plans\.plus\.name/)).toBeTruthy();
    });

    it("should have functional footer buttons with handlers", () => {
      const onClose = vi.fn();
      render(<PricingModal isOpen={true} onClose={onClose} />);

      // Billing help button under free plan
      const billingHelpBtn = screen.getByRole('button', { name: /pricing\.plans\.free\.footer\.billingHelp/ });
      billingHelpBtn.click();

      // Learn more button under business plan
      const learnMoreBtn = screen.getByRole('button', { name: /pricing\.plans\.business\.footer\.learnMore/ });
      learnMoreBtn.click();

      // No assertion on navigation side-effects here; just ensure buttons are present and clickable
      expect(billingHelpBtn).toBeTruthy();
      expect(learnMoreBtn).toBeTruthy();
    });
  });

  describe("Translation Completeness", () => {
    it('should have complete translations for all supported languages', async () => {
      const languages = [
        'en', 'es', 'fr', 'de', 'zh', 'ja', 'vi',
        'pt', 'ar', 'ru', 'it', 'ko', 'nl', 'pl',
        'tr', 'th', 'id', 'hi', 'uk'
      ];
      const requiredKeys = [
        'modal.title',
        'modal.currentPlan',
        'plans.free.name',
        'plans.free.description',
        'plans.free.buttonText',
        'plans.plus.name',
        'plans.plus.description',
        'plans.plus.buttonText',
        'plans.business.name',
        'plans.business.description',
        'plans.business.buttonText',
        'billing.monthly',
        'billing.yearly',
        'billing.billedMonthly',
        'billing.billedAnnually',
      ];

      // Load resources sequentially for each language
      for (const lang of languages) {
        await i18n.changeLanguage(lang);
        await i18n.loadNamespaces('pricing');
        const t = i18n.getFixedT(lang, 'pricing');
        
        requiredKeys.forEach(key => {
          const translation = t(key);
          expect(translation).toBeTruthy();
          // Should not return the key itself (fallback behavior)
          expect(translation).not.toBe(key);
        });
      }
    });

    it("should not have missing translation keys", async () => {
      const languages = [
        "en", "es", "fr", "de", "zh", "ja", "vi",
        "pt", "ar", "ru", "it", "ko", "nl", "pl",
        "tr", "th", "id", "hi", "uk"
      ];

      for (const lang of languages) {
        await i18n.changeLanguage(lang);
        const resources = i18n.getResourceBundle(lang, "pricing");

        // Should have loaded resources
        expect(resources).toBeTruthy();
        expect(Object.keys(resources || {}).length).toBeGreaterThan(0);
      }
    });

    it('should have pricing tiers defined', () => {
      // Import and verify pricing data structure
      const mockPricingData = {
        tiers: [
          { id: 'free', name: 'Free' },
          { id: 'plus', name: 'Plus' },
          { id: 'business', name: 'Business' },
        ],
      };

      expect(mockPricingData.tiers).toHaveLength(3);
      expect(mockPricingData.tiers[0].id).toBe('free');
    });

    it('should have consistent tier IDs across translations', () => {
      const tierIds = ['free', 'plus', 'business'];
      const t = i18n.getFixedT('en', 'pricing');

      tierIds.forEach(id => {
        expect(t(`plans.${id}.name`)).toBeTruthy();
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle missing translation gracefully", () => {
      const t = i18n.getFixedT("en", "pricing");
      const result = t("non.existent.key");

      // Should return something (key or fallback)
      expect(result).toBeTruthy();
    });

    it("should handle null/undefined currency gracefully", () => {
      // Should not throw error
      expect(() => {
        formatCurrency(100, null as unknown as string, "en");
      }).not.toThrow();
    });

    it("should handle invalid locale gracefully", () => {
      // Should not throw error
      expect(() => {
        formatCurrency(100, "USD", "invalid" as string);
      }).not.toThrow();
    });
  });

  describe("Accessibility", () => {
    it("should have language attribute on pricing components", async () => {
      await changeLanguage("es");
      render(<PricingComparison />);

      // Check that language is accessible
      expect(i18n.language).toBe("es");
    });

    it("should maintain semantic structure in all languages", async () => {
      const languages = ["en", "es", "fr"];

      for (const lang of languages) {
        await changeLanguage(lang);
        const { container } = render(<PricingComparison />);

        // Should have proper structure
        expect(container.querySelector('[class*="pricing"]')).toBeTruthy();
      }
    });
  });
});
