import { useState } from "react";
import type { Monster } from "../shared/types";
export function Register({ onRegister }: { onRegister: (m: Monster) => void }) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [success, setSuccess] = useState("");
  async function load(file?: File) {
    setError("");
    setSuccess("");
    setImage("");
    if (!file) return;
    if (file.type !== "image/png" || file.size > 5 * 1024 * 1024) {
      setError("5MB以下のPNGを選択してください。");
      return;
    }
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (bytes.join(",") !== "137,80,78,71,13,10,26,10") throw new Error();
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = data;
      });
      setImage(data);
    } catch {
      setError("PNG画像を読み込めませんでした。");
    } finally {
      setReading(false);
    }
  }
  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">A NEW ENCOUNTER</div>
          <h1>モンスター登録</h1>
          <p>あなたのドット絵に、新しい物語を。</p>
        </div>
      </div>
      <form
        className="panel register-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!image || !name.trim() || reading) return;
          onRegister({
            id: crypto.randomUUID(),
            name: name.trim(),
            image,
            generation: 1,
            stats: { hp: 100, attack: 20, defense: 20, magic: 20, speed: 20 },
            genes: { element: "無", body: "未分類", potential: "未知" },
            traits: [],
            parentIds: [],
          });
          setSuccess(`${name.trim()}を図鑑に登録しました。`);
          setName("");
          setImage("");
        }}
      >
        <label className="upload-zone">
          <div className="preview">
            {image ? (
              <img src={image} alt="アップロードしたモンスターのプレビュー" />
            ) : (
              <span>＋</span>
            )}
          </div>
          <strong>{reading ? "読み込み中…" : "PNGを選んでアップロード"}</strong>
          <span>透過PNG対応 · 最大5MB</span>
          <input
            type="file"
            accept="image/png"
            disabled={reading}
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <label className="name-input">
          モンスター名
          <input
            required
            maxLength={32}
            value={name}
            placeholder="名前をつけてください"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="muted">
          第1世代として登録されます。能力値はデモ用の初期値です。
        </p>
        {error && <p role="alert">{error}</p>}
        {success && (
          <p role="status" className="success">
            {success}
          </p>
        )}
        <button
          className="primary"
          disabled={!image || !name.trim() || reading}
        >
          図鑑に登録する
        </button>
      </form>
    </>
  );
}
