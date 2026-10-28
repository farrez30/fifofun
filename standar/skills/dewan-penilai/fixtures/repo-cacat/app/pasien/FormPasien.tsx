"use client";
import { useState } from "react";

export function FormPasien({ onHapus }: { onHapus: () => void }) {
  const [pesan, setPesan] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPesan("Data tersimpan — kembali ke daftar");
      }}
    >
      <input name="nama" placeholder="Nama lengkap" />
      <input name="hp" placeholder="Nomor HP" />
      <button type="submit">Simpan</button>
      <button type="button" onClick={onHapus}>
        <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 4h12M5 4V2h6v2M4 4l1 10h6l1-10" /></svg>
      </button>
      <p>{pesan}</p>
    </form>
  );
}
