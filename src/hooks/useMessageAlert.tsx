import { useCallback, useState } from "react";
import { MessageAlertModal } from "../components/ui/MessageAlertModal";

type AlertState = {
  open: boolean;
  title: string;
  message: string;
};

const initial: AlertState = { open: false, title: "Notice", message: "" };

export function useMessageAlert() {
  const [alert, setAlert] = useState<AlertState>(initial);

  const closeAlert = useCallback(() => {
    setAlert((prev) => ({ ...prev, open: false }));
  }, []);

  const showAlert = useCallback((message: string, title = "Notice") => {
    setAlert({ open: true, title, message });
  }, []);

  const showError = useCallback(
    (message: string, title = "Error") => {
      showAlert(message, title);
    },
    [showAlert],
  );

  const alertModal = (
    <MessageAlertModal
      open={alert.open}
      title={alert.title}
      message={alert.message}
      onClose={closeAlert}
    />
  );

  return { showAlert, showError, closeAlert, alertModal };
}
