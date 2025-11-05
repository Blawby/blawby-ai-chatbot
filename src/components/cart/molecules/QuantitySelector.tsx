import { useCallback } from 'preact/compat';
import { useId } from 'preact/hooks';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/outline';

interface Props {
  quantity: number;
  onChange: (q: number) => void;
  min?: number;
  helperText?: string;
  label?: string;
}

export const QuantitySelector = ({ quantity, onChange, min = 1, helperText, label = 'Users' }: Props) => {
  const inputId = useId();
  
  const handleIncrement = useCallback(() => {
    onChange(quantity + 1);
  }, [quantity, onChange]);

  const handleDecrement = useCallback(() => {
    onChange(Math.max(min, quantity - 1));
  }, [quantity, min, onChange]);

  const handleInputChange = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const value = parseInt(target.value) || min;
    onChange(Math.max(min, value));
  }, [min, onChange]);

  const canDecrement = quantity > min;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-100 mb-1">
        {label}
      </label>
      
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="number"
          value={quantity}
          onChange={handleInputChange}
          min={min}
          className="w-full px-3 py-2 text-sm border border-gray-600 rounded-lg bg-dark-input-bg text-white
            focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-accent-500
            appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={!canDecrement}
            className="w-9 h-9 flex items-center justify-center border border-gray-600 rounded-md
              hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500
              disabled:opacity-50 disabled:cursor-not-allowed bg-dark-input-bg"
            aria-label="Decrease value"
          >
            <MinusIcon className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleIncrement}
            className="w-9 h-9 flex items-center justify-center border border-gray-600 rounded-md
              hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-accent-500
              bg-dark-input-bg"
            aria-label="Increase value"
          >
            <PlusIcon className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      {helperText && <p className="text-xs text-gray-400 mt-2">{helperText}</p>}
    </div>
  );
};
