import { useCallback, useState } from "react";
import { MessageAlertModal } from "../components/ui/MessageAlertModal";

type AlertState = {
  open: boolean;
  title: string;
  message: string;
  variant: "success" | "error" | "info";
};

const initial: AlertState = { open: false, title: "Notice", message: "", variant: "info" };

export function useMessageAlert() {
  const [alert, setAlert] = useState<AlertState>(initial);

  const closeAlert = useCallback(() => {
    setAlert((prev) => ({ ...prev, open: false }));
  }, []);

  const showAlert = useCallback(
    (message: string, title = "Notice", variant: AlertState["variant"] = "info") => {
      setAlert({ open: true, title, message, variant });
    },
    [],
  );

  const showError = useCallback(
    (message: string, title = "Error") => {
      showAlert(message, title, "error");
    },
    [showAlert],
  );

  const showSuccess = useCallback(
    (message: string, title = "Saved") => {
      showAlert(message, title, "success");
    },
    [showAlert],
  );

  const alertModal = (
    <MessageAlertModal
      open={alert.open}
      title={alert.title}
      message={alert.message}
      variant={alert.variant}
      onClose={closeAlert}
    />
  );

  return { showAlert, showError, showSuccess, closeAlert, alertModal };
}
