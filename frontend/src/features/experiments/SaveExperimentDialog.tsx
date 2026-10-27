import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorBanner, Label, Modal } from "../../components/ui";
import { api, ApiError } from "../../services/api";

/**
 * Saves an experiment to the server's SQLite history. The request carries inputs only (workload or
 * generator, configurations); the server reruns the engine, so stored results can never come from the browser.
 */
export function SaveExperimentDialog({ open, onClose, body, defaultName, onSaved }: { open: boolean; onClose: () => void; body: Record<string, unknown>; defaultName: string; onSaved?: (id: number) => void }) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  useEffect(() => { if (open) { setName(defaultName); setSaved(null); setErr(null); } }, [open, defaultName]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.saveExperiment({ ...body, name });
      setSaved(r.id);
      onSaved?.(r.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.messages : [String(e)]);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Save experiment"
      footer={saved ? <Button variant="primary" onClick={onClose}>Done</Button> : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={save} icon={<Save className="size-4" />}>Save to SQLite</Button></>}>
      {saved ? (
        <p>Saved as experiment #{saved}. Find it in the <Link className="text-cyan-300 underline" to="/experiments" onClick={onClose}>Experiment Studio</Link> history.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-fg-faint">The server reruns the configuration and stores the engine's results, together with the workload and parameters, so the run can be reproduced exactly.</p>
          <Label htmlFor="exp-name">Experiment name</Label>
          <input id="exp-name" className="field" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          <div className="mt-3"><ErrorBanner messages={err} title="Could not save" /></div>
        </>
      )}
    </Modal>
  );
}

