import React from 'react';
import { useToastStore } from '../stores/toastStore';

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="toast show">
          {t.message}
        </div>
      ))}
    </div>
  );
}
