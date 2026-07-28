import {useEffect, useState, type FormEvent} from "react";
import {commitment} from "@poi/core";
import type {Address, Hex} from "viem";
import {CHAIN, SCHEMAS, isDeployed} from "./config";
import {attest, encodeNoteData, type AttestResult} from "./eas";
import {
    JOURNAL_STORAGE_KEY,
    addJournalEntry,
    deleteJournalEntry,
    listJournalEntries,
    parseJournal,
    type JournalEntry,
} from "./journal";
import {newSalt} from "./decision";
import {Receipt} from "./receipt";
import {SaltBackup} from "./saltBackup";
import {ZERO_UID} from "./wallet";

interface PendingNote {
    content: string;
    salt: Hex;
}

export function Note({address, onProgressChange}: {
    address?: Address;
    onProgressChange?: (progress: {journalCount: number; notePublished: boolean}) => void;
}) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [content, setContent] = useState("");
    const [pending, setPending] = useState<PendingNote>();
    const [receipt, setReceipt] = useState<AttestResult>();
    const [status, setStatus] = useState("");

    useEffect(() => {
        try {
            setEntries(parseJournal(localStorage.getItem(JOURNAL_STORAGE_KEY)));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "저널을 불러오지 못했습니다.");
        }
    }, []);

    useEffect(() => {
        onProgressChange?.({journalCount: entries.length, notePublished: receipt !== undefined});
    }, [entries.length, receipt, onProgressChange]);

    function save(next: JournalEntry[]) {
        const validated = listJournalEntries(next);
        localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(validated));
        setEntries(validated);
    }

    function add(event: FormEvent) {
        event.preventDefault();
        try {
            save(addJournalEntry(entries, content));
            setContent("");
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "저장하지 못했습니다.");
        }
    }

    function prepareNote(entry: JournalEntry) {
        setPending({content: entry.content, salt: newSalt()});
    }

    async function publish() {
        if (!pending || !address || !isDeployed()) return;
        try {
            const contentCommitment = commitment({
                tag: "NOTE",
                chainId: CHAIN.id,
                attester: address,
                salt: pending.salt,
                payload: pending.content,
            });
            const result = await attest({
                schema: SCHEMAS.note as Hex,
                data: encodeNoteData(contentCommitment),
                revocable: false,
                refUID: ZERO_UID,
            });
            setReceipt(result);
            setStatus("");
            setPending(undefined);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "노트 발행에 실패했습니다.");
        }
    }

    return (
        <section className="doc-section">
            <h2>저널과 노트</h2>
            <p className="notice">이 기록은 검증되지 않습니다</p>
            <form className="doc-form" onSubmit={add}>
                <div className="field">
                    <label htmlFor="journal-content">저널 내용</label>
                    <textarea id="journal-content" value={content} onChange={(e) => setContent(e.target.value)} />
                </div>
                <button className="btn" type="submit">저널 저장</button>
            </form>
            <ul className="record-list">
                {entries.map((entry) => (
                    <li key={entry.id}>
                        <p>{entry.content}</p>
                        <small className="timestamp">{new Date(entry.createdAt).toLocaleString("ko-KR")}</small>
                        <button className="btn" type="button" onClick={() => prepareNote(entry)} disabled={!isDeployed()}>
                            노트로 승격
                        </button>
                        <button className="btn-quiet" type="button" onClick={() => save(deleteJournalEntry(entries, entry.id))}>
                            삭제
                        </button>
                    </li>
                ))}
            </ul>
            {!address && <p className="notice notice--quiet">지갑을 연결해야 노트를 발행할 수 있습니다.</p>}
            {status && <p className="form-status" role="alert">{status}</p>}
            <Receipt label="노트" uid={receipt?.uid} txHash={receipt?.txHash} />
            {pending && (
                <SaltBackup
                    salts={{note: pending.salt}}
                    payload={pending.content}
                    onCancel={() => setPending(undefined)}
                    onProceed={publish}
                    publishDisabled={!address}
                    publishDisabledReason="노트를 발행하려면 지갑을 연결해 주세요."
                />
            )}
        </section>
    );
}
