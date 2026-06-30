"use client";

import { RiDeleteBinLine, RiUserLine } from "@remixicon/react";
import { useEffect, useState } from "react";
import type { GitIdentity } from "@shared/types";
import { getConfig, setConfig } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NameDialog } from "@/components/name-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";
import {
  getProfiles,
  newProfile,
  type Profile,
  profileToIdentity,
  saveProfiles,
} from "@/lib/profiles";

const EMPTY: GitIdentity = {
  userName: "",
  userEmail: "",
  signingKey: "",
  gpgFormat: "",
  sign: false,
};

export function RepoSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [id, setId] = useState<GitIdentity>(EMPTY);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProfiles(getProfiles());
    getConfig().then((r) => {
      if (!("error" in r))
        setId({
          userName: r.userName ?? "",
          userEmail: r.userEmail ?? "",
          signingKey: r.signingKey ?? "",
          gpgFormat: r.gpgFormat ?? "",
          sign: r.sign,
        });
    });
  }, [open]);

  const set = <K extends keyof GitIdentity>(k: K, v: GitIdentity[K]) =>
    setId((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    const r = await setConfig(id);
    setBusy(false);
    notify(r, "Saved identity");
    if (!r?.error) onOpenChange(false);
  };

  const apply = (p: Profile) => setId(profileToIdentity(p));

  const saveAsProfile = (label: string) => {
    if (!label.trim()) return;
    const next = [...profiles, newProfile(label.trim(), id)];
    saveProfiles(next);
    setProfiles(next);
  };

  const remove = (pid: string) => {
    const next = profiles.filter((p) => p.id !== pid);
    saveProfiles(next);
    setProfiles(next);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Identity & signing</DialogTitle>
          <DialogDescription>
            Sets this repository's local git config (overrides global).
          </DialogDescription>
        </DialogHeader>

        {profiles.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label>Profiles</Label>
            <div className="flex flex-wrap gap-1">
              {profiles.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2 text-xs"
                >
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => apply(p)}
                  >
                    {p.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <RiDeleteBinLine className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cfg-name">Name</Label>
              <Input
                id="cfg-name"
                value={id.userName ?? ""}
                onChange={(e) => set("userName", e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cfg-email">Email</Label>
              <Input
                id="cfg-email"
                value={id.userEmail ?? ""}
                onChange={(e) => set("userEmail", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="cfg-sign"
              checked={id.sign}
              onCheckedChange={(v) => set("sign", v === true)}
            />
            <Label htmlFor="cfg-sign" className="font-normal">
              Sign commits (commit.gpgsign)
            </Label>
          </div>

          <div className="flex gap-2">
            <div className="flex w-32 flex-col gap-1.5">
              <Label>Format</Label>
              <Select
                value={id.gpgFormat || "openpgp"}
                onValueChange={(v) => set("gpgFormat", v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openpgp">GPG</SelectItem>
                  <SelectItem value="ssh">SSH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cfg-key">Signing key</Label>
              <Input
                id="cfg-key"
                value={id.signingKey ?? ""}
                onChange={(e) => set("signingKey", e.target.value)}
                placeholder="key id or path to SSH key"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSaveOpen(true)}
            >
              <RiUserLine /> Save as profile
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <NameDialog
      open={saveOpen}
      onOpenChange={setSaveOpen}
      title="Save profile"
      description="Save the current identity & signing fields as a reusable profile."
      label="Profile name"
      placeholder="Work / Personal"
      submitLabel="Save profile"
      onSubmit={saveAsProfile}
    />
    </>
  );
}
