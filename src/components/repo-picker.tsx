import {
  RiDownloadCloud2Line,
  RiFolderOpenLine,
  RiGitRepositoryLine,
  RiLoader4Line,
} from "@remixicon/react";
import { useState } from "react";
import { cloneRepo, openRepo } from "@/app/actions";
import { FolderPicker } from "@/components/folder-picker";
import { GitLogo } from "@/components/git-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter } from "@/lib/router";

export function RepoPicker({ recent }: { recent: string[] }) {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [url, setUrl] = useState("");
  const [directory, setDirectory] = useState("");
  const [token, setToken] = useState("");
  const [opening, setOpening] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [openError, setOpenError] = useState<string>();
  const [cloneError, setCloneError] = useState<string>();

  const doOpen = async (p: string) => {
    if (opening) return;
    setOpening(true);
    setOpenError(undefined);
    const r = await openRepo(p);
    setOpening(false);
    if (r.error) setOpenError(r.error);
    else router.push("/");
  };

  const doClone = async () => {
    if (cloning) return;
    setCloning(true);
    setCloneError(undefined);
    const r = await cloneRepo(url, directory, token);
    setCloning(false);
    if (r.error) setCloneError(r.error);
    else router.push("/");
  };

  return (
    <div className="bg-background flex h-full flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-2">
            <GitLogo className="size-6 text-[#f05133]" />
            <CardTitle className="font-heading text-lg">OpenGit</CardTitle>
          </div>
          <CardDescription>
            Open a local repository or clone one from a URL to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="open">
            <TabsList className="w-full">
              <TabsTrigger value="open" className="flex-1">
                <RiFolderOpenLine /> Open local
              </TabsTrigger>
              <TabsTrigger value="clone" className="flex-1">
                <RiDownloadCloud2Line /> Clone
              </TabsTrigger>
            </TabsList>

            <TabsContent value="open" className="mt-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  doOpen(path);
                }}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="open-path">Repository folder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="open-path"
                      value={path}
                      readOnly
                      placeholder="No folder selected"
                      className="font-mono text-xs"
                    />
                    <FolderPicker
                      mode="repo"
                      title="Open repository"
                      description="Browse to a folder that is a git repository."
                      onPick={setPath}
                    >
                      <Button type="button" variant="outline">
                        <RiFolderOpenLine /> Browse
                      </Button>
                    </FolderPicker>
                  </div>
                </div>
                {openError ? (
                  <p className="text-destructive text-xs">{openError}</p>
                ) : null}
                <Button type="submit" size="lg" disabled={opening || !path}>
                  {opening ? (
                    <RiLoader4Line className="animate-spin" />
                  ) : (
                    <RiFolderOpenLine />
                  )}
                  Open repository
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="clone" className="mt-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  doClone();
                }}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="clone-url">Remote URL</Label>
                  <Input
                    id="clone-url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    autoComplete="off"
                    spellCheck={false}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="clone-dir">Destination folder</Label>
                  <div className="flex gap-2">
                    <Input
                      id="clone-dir"
                      value={directory}
                      readOnly
                      placeholder="No folder selected"
                      className="font-mono text-xs"
                    />
                    <FolderPicker
                      mode="dir"
                      title="Choose destination"
                      description="The repository will be cloned into a sub-folder here."
                      onPick={setDirectory}
                    >
                      <Button type="button" variant="outline">
                        <RiFolderOpenLine /> Browse
                      </Button>
                    </FolderPicker>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="clone-token">
                    Access token{" "}
                    <span className="text-muted-foreground font-normal">
                      (private repos only)
                    </span>
                  </Label>
                  <Input
                    id="clone-token"
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Personal access token"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                {cloneError ? (
                  <p className="text-destructive text-xs">{cloneError}</p>
                ) : null}
                <Button
                  type="submit"
                  size="lg"
                  disabled={cloning || !directory || !url}
                >
                  {cloning ? (
                    <RiLoader4Line className="animate-spin" />
                  ) : (
                    <RiDownloadCloud2Line />
                  )}
                  Clone repository
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {recent.length > 0 ? (
            <div className="mt-6">
              <p className="text-muted-foreground mb-2 text-xs font-medium">
                Recent
              </p>
              <div className="flex flex-col gap-1">
                {recent.map((recentPath) => {
                  const parts = recentPath.split(/[/\\]/).filter(Boolean);
                  const name = parts.at(-1) ?? recentPath;
                  const location = parts.slice(0, -1).join("/") || recentPath;
                  return (
                    <button
                      key={recentPath}
                      type="button"
                      onClick={() => doOpen(recentPath)}
                      className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full min-w-0 items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                    >
                      <RiGitRepositoryLine className="size-3.5 shrink-0 self-center" />
                      <span className="text-foreground shrink-0 font-medium">
                        {name}
                      </span>
                      <span className="truncate text-[0.7rem]">{location}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
