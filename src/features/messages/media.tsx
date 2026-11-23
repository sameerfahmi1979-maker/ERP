"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { check, download, chatFetch } from "./client";
import { root, type Attachment, type Mode } from "./model";
import { Vault } from "./vault";
import { Issue } from "./controls";
import { useTask } from "./hooks";

export function AttachmentItem({
  item,
  mode,
  vault,
  incoming = false,
}: {
  item: Attachment;
  mode: Mode;
  vault: Vault;
  incoming?: boolean;
}) {
  const [url, setUrl] = useState(""),
    [saved, setSaved] = useState(false);
  const { run, busy, issue } = useTask();
  const controller = useRef<AbortController | null>(null);
  const key = "cache/" + item.conversationId + "/media/" + vault.session + "/" + item.id;
  useEffect(() => {
    const c = new AbortController();
    controller.current = c;
    return () => c.abort();
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    const network = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } })
      .connection;
    if (
      !incoming ||
      mode !== "participant" ||
      network?.type !== "wifi" ||
      network.saveData ||
      !navigator.onLine
    )
      return;
    const c = new AbortController();
    void (async () => {
      if (await vault.get<boolean>(key + "/saved")) {
        if (!c.signal.aborted) setSaved(true);
        return;
      }
      const res = await check(
        await chatFetch(root + "/attachments/" + encodeURIComponent(item.id) + "?mode=participant", {
          cache: "no-store",
          credentials: "same-origin",
          signal: c.signal,
        }),
      );
      const data = await res.arrayBuffer();
      c.signal.throwIfAborted();
      await vault.bytes(key, data);
      await vault.put(key + "/saved", true);
      if (!c.signal.aborted) setSaved(true);
    })().catch(() => {});
    return () => c.abort();
  }, [item.id, key, mode, vault, incoming]);
  const open = () =>
    void run(async () => {
      const signal = controller.current!.signal;
      let blob: Blob;
      if (!navigator.onLine && mode === "participant") {
        const bytes = await vault.readBytes(key);
        if (!bytes) throw Error("Connect to download this file.");
        blob = new Blob([bytes], { type: item.mime });
      } else {
        const response = await check(
          await chatFetch(root + "/attachments/" + encodeURIComponent(item.id) + "?mode=" + mode, {
            credentials: "same-origin",
            cache: "no-store",
            signal,
          }),
        );
        blob = await response.blob();
        signal.throwIfAborted();
        if (mode === "participant") {
          await vault.bytes(key, await blob.arrayBuffer());
          await vault.put(key + "/saved", true);
          setSaved(true);
        }
      }
      signal.throwIfAborted();
      if (["voice", "audio", "video", "image"].includes(item.kind)) setUrl(URL.createObjectURL(blob));
      else download(blob, item.filename);
    });
  return (
    <div className="chat-file">
      <button disabled={busy} onClick={open}>
        {item.kind === "voice" ? "Play voice note" : item.filename}
      </button>
      <small>
        {Math.ceil(item.byteLength / 1024)} KB{saved ? " · On this device" : ""}
      </small>
      {url &&
        (["voice", "audio"].includes(item.kind) ? (
          <audio src={url} controls />
        ) : item.kind === "video" ? (
          <video src={url} controls />
        ) : (
          <Image
            unoptimized
            src={url}
            alt={item.filename}
            width={640}
            height={480}
            style={{ width: "auto", height: "auto", objectFit: "contain" }}
          />
        ))}
      <Issue text={issue} />
    </div>
  );
}
export function Recorder({ onRecord, disabled }: { onRecord: (file: File) => void; disabled: boolean }) {
  const [active, setActive] = useState(false),
    [pending, setPending] = useState(false),
    [issue, setIssue] = useState("");
  const live = useRef<MediaRecorder | null>(null),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const r = live.current;
      if (r) {
        r.onstop = null;
        if (r.state !== "inactive") r.stop();
        r.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);
  const start = async () => {
    setIssue("");
    setPending(true);
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw Error("Voice recording is unavailable in this browser.");
      const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) throw Error("This browser cannot record a supported voice-note format.");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      live.current = recorder;
      const chunks: Blob[] = [];
      let size = 0,
        overflow = false;
      recorder.ondataavailable = (e) => {
        size += e.data.size;
        if (size > 52428800) {
          overflow = true;
          if (recorder.state === "recording") recorder.stop();
        } else chunks.push(e.data);
      };
      recorder.onerror = () => {
        overflow = true;
        setIssue("Recording failed. Record another voice note.");
        recorder.stream.getTracks().forEach((t) => t.stop());
      };
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop());
        live.current = null;
        if (!mounted.current) return;
        setActive(false);
        if (overflow) {
          setIssue("The recording could not be kept. Check the 50 MiB file limit.");
          return;
        }
        if (size > 0)
          onRecord(
            new File(
              chunks,
              "Voice note " +
                new Date().toISOString().replace(/[:.]/g, "-") +
                (mime === "audio/webm" ? ".webm" : ".m4a"),
              { type: mime },
            ),
          );
      };
      recorder.start(1000);
      setActive(true);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      setIssue(e instanceof Error ? e.message : "Recording failed.");
    } finally {
      if (mounted.current) setPending(false);
    }
  };
  return (
    <div>
      <button
        disabled={pending || (!active && disabled)}
        onClick={() => {
          if (active) live.current?.stop();
          else void start();
        }}
      >
        {active ? "Stop and attach recording" : "Record voice note"}
      </button>
      <Issue text={issue} />
    </div>
  );
}
