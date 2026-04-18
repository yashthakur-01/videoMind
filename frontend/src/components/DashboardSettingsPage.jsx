import { useMemo, useState } from "react";
import { ChevronDown, KeyRound } from "lucide-react";
import { DashboardSidebarLayout } from "./DashboardSidebarLayout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const providers = {
  OpenAI: ["gpt-4o", "gpt-4.1-mini"],
  Gemini: [
    "gemini-2.0-flash",
    "gemini-2.0-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ],
};

export function DashboardSettingsPage({
  providerSettings,
  onProviderSettingsChange,
  onSaveProviderSettings,
  settingsLoading,
  videos,
  historyLoading,
  historyItemLoadingId,
}) {
  const [settingsError, setSettingsError] = useState("");

  const availableModels = useMemo(
    () => providers[providerSettings.activeProvider] ?? providers.OpenAI,
    [providerSettings.activeProvider],
  );

  const hasSavedKeyForActiveProvider =
    providerSettings.savedKeys?.[providerSettings.activeProvider] ?? false;

  const handleProviderChange = (value) => {
    onProviderSettingsChange((current) => ({
      ...current,
      activeProvider: value,
      activeModel: providers[value][0],
      apiKeyInput: "",
    }));
  };

  const submitProviderSettings = async (event) => {
    event.preventDefault();
    setSettingsError("");
    try {
      await onSaveProviderSettings({
        provider: providerSettings.activeProvider,
        model: providerSettings.activeModel,
        apiKey: providerSettings.apiKeyInput.trim(),
      });
    } catch (error) {
      setSettingsError(error.message);
    }
  };

  return (
    <DashboardSidebarLayout
      pageTitle="API Key and Model Settings"
      videos={videos}
      historyLoading={historyLoading}
      historyItemLoadingId={historyItemLoadingId}
    >
      <form
        onSubmit={submitProviderSettings}
        className="glass mx-auto grid max-w-3xl gap-4 rounded-2xl border border-white/15 bg-black/65 p-4 md:grid-cols-4"
      >
        <div className="col-span-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Provider Settings
            </h2>
            <p className="text-sm text-zinc-300">
              Configure provider, model, and API key for video processing and
              chat.
            </p>
          </div>
          {settingsLoading ? (
            <span className="text-xs text-zinc-400">Loading...</span>
          ) : null}
        </div>

        <label className="space-y-2 text-sm text-zinc-200">
          <span>Provider</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between border-white/20 bg-black/70 text-white hover:bg-zinc-900"
              >
                {providerSettings.activeProvider}
                <ChevronDown className="opacity-60" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
              {Object.keys(providers).map((item) => (
                <DropdownMenuItem
                  key={item}
                  onSelect={() => handleProviderChange(item)}
                >
                  {item}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </label>

        <label className="space-y-2 text-sm text-zinc-200">
          <span>Model</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between border-white/20 bg-black/70 text-white hover:bg-zinc-900"
              >
                {providerSettings.activeModel}
                <ChevronDown className="opacity-60" size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
              {availableModels.map((item) => (
                <DropdownMenuItem
                  key={item}
                  onSelect={() =>
                    onProviderSettingsChange((current) => ({
                      ...current,
                      activeModel: item,
                    }))
                  }
                >
                  {item}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </label>

        <label className="col-span-2 space-y-2 text-sm text-zinc-200">
          <span className="inline-flex items-center gap-2">
            <KeyRound size={14} /> API Key
          </span>
          <input
            type="password"
            value={providerSettings.apiKeyInput}
            onChange={(event) =>
              onProviderSettingsChange((current) => ({
                ...current,
                apiKeyInput: event.target.value,
              }))
            }
            placeholder={
              hasSavedKeyForActiveProvider
                ? "Saved key exists. Enter a new one to replace it."
                : "sk-..."
            }
            autoComplete="off"
            className="w-full rounded-xl border border-white/20 bg-black/70 px-3 py-2 text-sm tracking-wide text-white placeholder:text-zinc-500 focus:border-white/60 focus:outline-none"
          />
          <p className="text-xs text-zinc-400">
            {hasSavedKeyForActiveProvider
              ? "A key is already saved for this provider. Leaving this blank keeps the existing key."
              : "No key saved yet for this provider."}
          </p>
        </label>

        {settingsError ? (
          <p className="col-span-4 text-sm text-rose-300">{settingsError}</p>
        ) : null}

        <button
          disabled={settingsLoading}
          type="submit"
          className="col-span-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-70"
        >
          Save Settings
        </button>
      </form>
    </DashboardSidebarLayout>
  );
}
