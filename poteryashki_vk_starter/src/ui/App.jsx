import React, { useEffect, useMemo, useState } from "react";
import { initVK, getVKUser } from "../lib/vk";
import { supabase } from "../lib/supabase";

const SECTIONS = [
  { id: "found", label: "Найденные товары", icon: "📦" },
  { id: "missing", label: "Не нашли товар", icon: "🔎" },
  { id: "sovetskaya", label: "Советская", icon: "📍" },
  { id: "titova", label: "Титова", icon: "📍" },
  { id: "mine", label: "Мои записи", icon: "👤" },
];

const initialRecords = [
  {
    id: "demo-1", type: "found", branch: "sovetskaya",
    title: "Пример найденного товара", description: "Демонстрационная запись — замените её реальной находкой.",
    foundDate: new Date().toISOString().slice(0, 10), handoverDate: "",
    status: "open", image: "", authorId: "demo", authorName: "Демо-менеджер",
    createdAt: new Date().toISOString(), demo: true
  },
  {
    id: "demo-2", type: "missing", branch: "titova",
    title: "Пример запроса на поиск", description: "Демонстрация запроса для другого пункта выдачи.",
    foundDate: new Date().toISOString().slice(0, 10), handoverDate: "",
    status: "searching", image: "", authorId: "demo", authorName: "Демо-менеджер",
    createdAt: new Date().toISOString(), demo: true
  }
];

const statusLabels = {
  open: "Ожидает владельца",
  searching: "Ищем",
  matched: "Найден",
  transferred: "Передан в нужный ПВЗ",
  closed: "Закрыт",
  handed_over: "Выдан"
};

export function App() {
  const [section, setSection] = useState("found");
  const [records, setRecords] = useState(initialRecords);
  const [user, setUser] = useState(null);
  const [isManager, setIsManager] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [kind, setKind] = useState("found");
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({
    branch: "sovetskaya", title: "", description: "", foundDate: new Date().toISOString().slice(0, 10),
    handoverDate: "", image: ""
  });

  useEffect(() => {
    initVK().then(() => getVKUser()).then((u) => {
      if (u) setUser({ id: String(u.id), name: [u.first_name, u.last_name].filter(Boolean).join(" ") });
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("records").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setRecords(data.map(fromDb));
      });
  }, []);

  function fromDb(r) {
    return {
      id: r.id, type: r.type, branch: r.branch, title: r.title, description: r.description || "",
      foundDate: r.found_date || "", handoverDate: r.handover_date || "", status: r.status,
      image: r.image_url || "", authorId: String(r.author_vk_id || ""), authorName: r.author_name || "Менеджер",
      createdAt: r.created_at, demo: false
    };
  }

  const filtered = useMemo(() => records.filter((r) => {
    if (section === "found" && r.type !== "found") return false;
    if (section === "missing" && r.type !== "missing") return false;
    if (section === "sovetskaya" && r.branch !== "sovetskaya") return false;
    if (section === "titova" && r.branch !== "titova") return false;
    if (section === "mine" && (!user || r.authorId !== user.id)) return false;
    if (branchFilter !== "all" && r.branch !== branchFilter) return false;
    const haystack = `${r.title} ${r.description}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [records, section, user, branchFilter, search]);

  async function submitRecord(e) {
    e.preventDefault();
    if (!isManager) { setNotice("Добавлять записи могут только подтверждённые менеджеры."); return; }
    if (!form.title.trim()) { setNotice("Укажи название или описание товара."); return; }
    const record = {
      id: crypto.randomUUID(), type: kind, branch: form.branch, title: form.title.trim(),
      description: form.description.trim(), foundDate: form.foundDate, handoverDate: form.handoverDate,
      status: kind === "found" ? "open" : "searching", image: form.image,
      authorId: user?.id || "local-manager", authorName: user?.name || "Менеджер",
      createdAt: new Date().toISOString(), demo: false
    };
    if (supabase) {
      const { data, error } = await supabase.from("records").insert({
        type: record.type, branch: record.branch, title: record.title, description: record.description,
        found_date: record.foundDate || null, handover_date: record.handoverDate || null,
        status: record.status, image_url: record.image || null,
        author_vk_id: record.authorId, author_name: record.authorName
      }).select().single();
      if (error) { setNotice(`Не удалось сохранить запись: ${error.message}`); return; }
      setRecords((prev) => [fromDb(data), ...prev.filter((r) => !r.demo)]);
    } else {
      setRecords((prev) => [record, ...prev.filter((r) => !r.demo)]);
    }
    setShowForm(false);
    setForm({ branch: "sovetskaya", title: "", description: "", foundDate: new Date().toISOString().slice(0, 10), handoverDate: "", image: "" });
    setNotice("Запись добавлена. В демо-режиме она хранится только до перезагрузки страницы.");
  }

  async function claim(record) {
    if (record.demo) { setNotice("Это демонстрационная карточка. Добавьте реальную запись после настройки."); return; }
    if (supabase) {
      const { error } = await supabase.from("claims").insert({
        record_id: record.id, claimant_vk_id: user?.id || null,
        claimant_name: user?.name || "Пользователь", status: "new"
      });
      if (error) { setNotice(error.code === "23505" ? "Вы уже отправили заявку по этой записи." : `Не удалось отправить заявку: ${error.message}`); return; }
    }
    setNotice(`Заявка по записи «${record.title}» создана. Для уведомления беседы нужно настроить серверного VK-бота.`);
  }

  async function changeStatus(record, status) {
    if (!isManager) { setNotice("Изменять статусы могут только менеджеры."); return; }
    if (supabase && !record.demo) {
      const { error } = await supabase.from("records").update({ status }).eq("id", record.id);
      if (error) { setNotice(`Не удалось обновить статус: ${error.message}`); return; }
    }
    setRecords((prev) => prev.map((r) => r.id === record.id ? { ...r, status } : r));
    setNotice("Статус обновлён.");
  }

  function updateForm(key, value) { setForm((prev) => ({ ...prev, [key]: value })); }

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-mark">П</div>
        <div><p className="eyebrow">ВНУТРЕННИЙ СЕРВИС ПВЗ</p><h1>Потеряшки</h1><p className="hero-sub">Советская · Титова</p></div>
      </header>

      <div className="top-actions">
        <label className="searchbox"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Найти товар..." /></label>
        <button className="manager-toggle" onClick={() => setIsManager((v) => !v)}>{isManager ? "Режим менеджера ✓" : "Войти как менеджер"}</button>
      </div>
      {isManager && <div className="notice warning">Демо-переключатель для проверки интерфейса. В опубликованной версии права менеджеров должны проверяться сервером по VK ID.</div>}

      <nav className="menu-grid">
        {SECTIONS.map((s) => <button key={s.id} className={`menu-item ${section === s.id ? "active" : ""}`} onClick={() => setSection(s.id)}>
          <span className="menu-icon">{s.icon}</span><span>{s.label}</span>
        </button>)}
      </nav>

      <div className="section-heading">
        <div><p className="eyebrow">КАТАЛОГ</p><h2>{SECTIONS.find((s) => s.id === section)?.label}</h2></div>
        {isManager && <button className="primary" onClick={() => { setKind(section === "missing" ? "missing" : "found"); setShowForm(true); }}>＋ Добавить</button>}
      </div>

      <div className="filters">
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} aria-label="Фильтр по ПВЗ">
          <option value="all">Все пункты</option><option value="sovetskaya">Советская</option><option value="titova">Титова</option>
        </select>
        <span className="count">{filtered.length} записей</span>
      </div>

      {showForm && <form className="form-card" onSubmit={submitRecord}>
        <div className="form-title"><h3>Новая запись</h3><button type="button" className="icon-button" onClick={() => setShowForm(false)}>✕</button></div>
        <label>Тип записи<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="found">Найденный товар</option><option value="missing">Не удалось найти товар</option></select></label>
        <label>Пункт выдачи<select value={form.branch} onChange={(e) => updateForm("branch", e.target.value)}><option value="sovetskaya">Советская</option><option value="titova">Титова</option></select></label>
        <label>Название / описание товара *<input required value={form.title} onChange={(e) => updateForm("title", e.target.value)} placeholder="Например: чёрная коробка, бренд..." /></label>
        <label>Дополнительные приметы<textarea value={form.description} onChange={(e) => updateForm("description", e.target.value)} placeholder="Цвет, размер, упаковка, номер заказа без личных данных" rows="3" /></label>
        <label>Дата обнаружения / поиска<input type="date" value={form.foundDate} onChange={(e) => updateForm("foundDate", e.target.value)} /></label>
        <label>Дата выдачи клиенту (если известна)<input type="date" value={form.handoverDate} onChange={(e) => updateForm("handoverDate", e.target.value)} /></label>
        <label>Ссылка на фото (пока для прототипа)<input value={form.image} onChange={(e) => updateForm("image", e.target.value)} placeholder="https://..." /></label>
        <button className="primary full" type="submit">Опубликовать запись</button>
      </form>}

      {filtered.length === 0 ? <div className="empty"><div>🗂️</div><h3>Пока ничего нет</h3><p>Попробуйте изменить фильтр или поиск.</p></div> :
        <div className="record-list">{filtered.map((r) => <article className="record-card" key={r.id}>
          {r.image ? <img className="record-image" src={r.image} alt="" /> : <div className="record-image placeholder">📦</div>}
          <div className="record-content">
            <div className="record-meta"><span className={`tag ${r.type}`}>{r.type === "found" ? "Найденный товар" : "Запрос на поиск"}</span><span className="status">{statusLabels[r.status] || r.status}</span></div>
            <h3>{r.title}</h3><p>{r.description || "Без дополнительного описания."}</p>
            <div className="record-details"><span>📍 {r.branch === "sovetskaya" ? "Советская" : "Титова"}</span><span>📅 {r.foundDate || "Дата не указана"}</span>{r.handoverDate && <span>🤝 Выдан: {r.handoverDate}</span>}</div>
            <div className="card-actions">
              {r.type === "missing" && r.status === "searching" && <button className="primary" onClick={() => claim(r)}>Я нашёл товар</button>}
              {r.type === "found" && r.status === "open" && <button className="primary" onClick={() => claim(r)}>Я нашёл / нашла</button>}
              {isManager && <select value={r.status} onChange={(e) => changeStatus(r, e.target.value)} aria-label="Изменить статус">
                {Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>}
            </div>
          </div>
        </article>)}</div>}

      {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>✕</button></div>}
      <footer>Потеряшки · внутренняя система пунктов выдачи</footer>
    </main>
  );
}