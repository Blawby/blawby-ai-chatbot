let modalCount = 0;

export const lockBodyScroll = () => {
  if (typeof document === 'undefined') return;
  modalCount += 1;
  if (modalCount === 1) {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
  }
};

export const unlockBodyScroll = () => {
  if (typeof document === 'undefined') return;
  modalCount = Math.max(0, modalCount - 1);
  if (modalCount === 0) {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.body.classList.remove('modal-open');
  }
};

export const getModalStackCount = () => modalCount;
