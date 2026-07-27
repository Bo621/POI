import {useEffect, useState, type FormEvent} from "react";
import {commitment} from "@poi/core";
import type {Address, Hex} from "viem";
import {CHAIN, SCHEMAS, isDeployed} from "./config";
import {attest, encodeNoteData} from "./eas";
import {
    JOURNAL_STORAGE_KEY,
    addJournalEntry,
    deleteJournalEntry,
    listJournalEntries,
    parseJournal,
    type JournalEntry,
} from "./journal";
import {newSalt} from "./decision";
import {SaltBackup} from "./saltBackup";
import {ZERO_UID} from "./wallet";

interface PendingNote {
    content: string;
    salt: Hex;
}

export function Note({address}: {address?: Address}) {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [content, setContent] = useState("");
    const [pending, setPending] = useState<PendingNote>();
    const [status, setStatus] = useState("");

    useEffect(() => {
        try {
            setEntries(parseJournal(localStorage.getItem(JOURNAL_STORAGE_KEY)));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "저널을 불러오지 못했습니다.");
        }
    }, []);

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
        if (!address) {
            setStatus("먼저 지갑을 연결해 주세요.");
            return;
        }
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
            const hash = await attest({
                schema: SCHEMAS.note as Hex,
                data: encodeNoteData(contentCommitment),
                revocable: false,
                refUID: ZERO_UID,
            });
            setStatus(`노트 발행 트랜잭션: ${hash}`);
            setPending(undefined);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "노트 발행에 실패했습니다.");
        }
    }

    return (
        <section>
            <h2>저널과 노트</h2>
            <p>이 기록은 검증되지 않습니다</p>
            <form onSubmit={add}>
                <label>저널 내용<textarea value={content} onChange={(e) => setContent(e.target.value)} /></label>
                <button type="submit">저널 저장</button>
            </form>
            <ul>
                {entries.map((entry) => (
                    <li key={entry.id}>
                        <p>{entry.content}</p>
                        <small>{new Date(entry.createdAt).toLocaleString("ko-KR")}</small>
                        <button type="button" onClick={() => prepareNote(entry)} disabled={!isDeployed()}>
                            노트로 승격
                        </button>
                        <button type="button" onClick={() => save(deleteJournalEntry(entries, entry.id))}>
                            삭제
                        </button>
                    </li>
                ))}
            </ul>
            {status && <p role="alert">{status}</p>}
            {pending && (
                <SaltBackup
                    salts={{note: pending.salt}}
                    payload={pending.content}
                    onCancel={() => setPending(undefined)}
                    onProceed={publish}
                />
            )}
        </section>
    );
}
