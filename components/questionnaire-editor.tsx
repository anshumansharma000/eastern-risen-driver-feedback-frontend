"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  AdminQuestion,
  DataResponse,
  QuestionCategory,
  QuestionnaireVersion,
  QuestionType,
} from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { ErrorAlert, LoadingCards, StatusBadge } from "./ui";
import { AlertDialog } from "./alert-dialog";

const types: QuestionType[] = ["STAR_RATING", "EMOJI_RATING", "YES_NO", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TEXT"];
const categories: QuestionCategory[] = ["OVERALL_EXPERIENCE", "DRIVING_SAFETY", "PUNCTUALITY", "CLEANLINESS", "PROFESSIONALISM", "VEHICLE_CONDITION", "CUSTOM"];
const hasOptions = (type: QuestionType) => !["STAR_RATING", "TEXT"].includes(type);
const isConfigurableChoice = (type: QuestionType) => ["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(type);

type EditableOption = {
  clientKey: string;
  valueKey: string;
  label: string;
  scoreValue: number | null;
};
type EditableQuestion = Omit<AdminQuestion, "id" | "displayOrder" | "options"> & {
  clientKey: string;
  options: EditableOption[];
};
type FieldErrors = Record<string, string>;

const generateOptionKey = () => `option_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
const newOption = (): EditableOption => ({
  clientKey: crypto.randomUUID(),
  valueKey: generateOptionKey(),
  label: "",
  scoreValue: null,
});

function canonicalPath(path: unknown) {
  if (Array.isArray(path)) return path.map(String).join(".");
  if (typeof path !== "string") return "";
  return path
    .replace(/^\/+/, "")
    .replaceAll("/", ".")
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\.+|\.+$/g, "")
    .replace(/^body\./, "");
}

function backendFieldErrors(details: unknown): FieldErrors {
  const result: FieldErrors = {};
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const issue = value as Record<string, unknown>;
    let path = canonicalPath(issue.instancePath ?? issue.path ?? issue.field ?? issue.dataPath);
    const params = issue.params && typeof issue.params === "object" ? issue.params as Record<string, unknown> : undefined;
    if (issue.keyword === "required" && typeof params?.missingProperty === "string") {
      path = [path, params.missingProperty].filter(Boolean).join(".");
    }
    const message = typeof issue.message === "string" ? issue.message : typeof issue.error === "string" ? issue.error : undefined;
    if (path && message) result[path] ??= message;
    for (const [key, nestedValue] of Object.entries(issue)) {
      const keyedPath = canonicalPath(key);
      const keyedMessage = typeof nestedValue === "string"
        ? nestedValue
        : Array.isArray(nestedValue) && typeof nestedValue[0] === "string"
          ? nestedValue[0]
          : undefined;
      if (keyedPath.startsWith("questions.") && keyedMessage) result[keyedPath] ??= keyedMessage;
    }
    for (const key of ["errors", "issues", "validation", "details"]) {
      if (issue[key] !== value) visit(issue[key]);
    }
  };
  visit(details);
  return result;
}

function publishErrors(questions: EditableQuestion[]): FieldErrors {
  const result: FieldErrors = {};
  questions.forEach((question, questionIndex) => {
    if (!hasOptions(question.questionType)) return;
    const prefix = `questions.${questionIndex}.options`;
    if (question.options.length < 2) result[prefix] = "Add at least two options before publishing.";
    question.options.forEach((option, optionIndex) => {
      if (!option.label.trim()) result[`${prefix}.${optionIndex}.label`] = "Enter an option label.";
      if (question.contributesToScore && (option.scoreValue === null || !Number.isFinite(option.scoreValue))) {
        result[`${prefix}.${optionIndex}.scoreValue`] = "Enter a numeric score for this option.";
      }
    });
  });
  return result;
}

const toEditable = (question: AdminQuestion): EditableQuestion => ({
  clientKey: question.id,
  stableKey: question.stableKey,
  prompt: question.prompt,
  questionType: question.questionType,
  category: question.category,
  status: question.status,
  isRequired: question.isRequired,
  contributesToScore: question.contributesToScore,
  scoreMin: question.scoreMin,
  scoreMax: question.scoreMax,
  options: question.options.map((option) => ({
    clientKey: crypto.randomUUID(),
    valueKey: option.valueKey,
    label: option.label,
    scoreValue: option.scoreValue,
  })),
});

export function QuestionnaireEditor({ questionnaireId }: { questionnaireId: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const versionId = params.get("version");
  const [version, setVersion] = useState<QuestionnaireVersion | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[]>([]);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const load = useCallback(async () => {
    if (!versionId) return;
    setError(null);
    try {
      const response = await apiRequest<DataResponse<QuestionnaireVersion>>(
        `/api/v1/admin/questionnaires/${questionnaireId}/versions/${versionId}`,
      );
      setVersion(response.data);
      setQuestions(response.data.questions.map(toEditable));
      setFieldErrors({});
    } catch (cause) {
      setError({
        message: errorMessage(cause),
        requestId: cause instanceof ApiError ? cause.requestId : undefined,
      });
    }
  }, [versionId, questionnaireId]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  function clearQuestionErrors(index: number) {
    const prefix = `questions.${index}`;
    setFieldErrors((current) => Object.fromEntries(
      Object.entries(current).filter(([path]) => path !== prefix && !path.startsWith(`${prefix}.`)),
    ));
    setError(null);
  }

  function update(index: number, patch: Partial<EditableQuestion>) {
    clearQuestionErrors(index);
    setQuestions((current) => current.map((question, questionIndex) => (
      questionIndex === index ? { ...question, ...patch } : question
    )));
  }

  function updateOption(questionIndex: number, optionIndex: number, patch: Partial<EditableOption>) {
    clearQuestionErrors(questionIndex);
    setQuestions((current) => current.map((question, currentQuestionIndex) => (
      currentQuestionIndex === questionIndex
        ? {
            ...question,
            options: question.options.map((option, currentOptionIndex) => (
              currentOptionIndex === optionIndex ? { ...option, ...patch } : option
            )),
          }
        : question
    )));
  }

  function addOption(questionIndex: number) {
    clearQuestionErrors(questionIndex);
    setQuestions((current) => current.map((question, currentQuestionIndex) => (
      currentQuestionIndex === questionIndex
        ? { ...question, options: [...question.options, newOption()] }
        : question
    )));
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    clearQuestionErrors(questionIndex);
    setQuestions((current) => current.map((question, currentQuestionIndex) => (
      currentQuestionIndex === questionIndex
        ? { ...question, options: question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex) }
        : question
    )));
  }

  function moveOption(questionIndex: number, optionIndex: number, direction: -1 | 1) {
    clearQuestionErrors(questionIndex);
    setQuestions((current) => current.map((question, currentQuestionIndex) => {
      if (currentQuestionIndex !== questionIndex) return question;
      const destination = optionIndex + direction;
      if (destination < 0 || destination >= question.options.length) return question;
      const options = [...question.options];
      [options[optionIndex], options[destination]] = [options[destination], options[optionIndex]];
      return { ...question, options };
    }));
  }

  function handleApiError(cause: unknown) {
    setFieldErrors(cause instanceof ApiError ? backendFieldErrors(cause.details) : {});
    setError({
      message: errorMessage(cause),
      requestId: cause instanceof ApiError ? cause.requestId : undefined,
    });
  }

  function add() {
    setQuestions((current) => [
      ...current,
      {
        clientKey: crypto.randomUUID(),
        stableKey: `question_${current.length + 1}`,
        prompt: "",
        questionType: "STAR_RATING",
        category: "CUSTOM",
        status: "ACTIVE",
        isRequired: true,
        contributesToScore: true,
        scoreMin: 1,
        scoreMax: 5,
        options: [],
      },
    ]);
  }

  function requestBody() {
    return {
      questions: questions.map((question) => {
        const scored = question.questionType !== "TEXT" && question.contributesToScore;
        const scoredStar = question.questionType === "STAR_RATING" && scored;
        return {
          stableKey: question.stableKey,
          prompt: question.prompt,
          questionType: question.questionType,
          category: question.category,
          status: question.status,
          isRequired: question.isRequired,
          contributesToScore: scored,
          scoreMin: scoredStar ? question.scoreMin : null,
          scoreMax: scoredStar ? question.scoreMax : null,
          options: question.options.map((option) => ({
            valueKey: option.valueKey,
            label: option.label,
            scoreValue: option.scoreValue,
          })),
        };
      }),
    };
  }

  async function replaceQuestions() {
    if (!versionId) return;
    await apiRequest(`/api/v1/admin/questionnaires/${questionnaireId}/versions/${versionId}/questions`, {
      method: "PUT",
      body: JSON.stringify(requestBody()),
    });
  }

  async function save() {
    if (!versionId) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await replaceQuestions();
      await load();
    } catch (cause) {
      handleApiError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!versionId) return;
    const validation = publishErrors(questions);
    setFieldErrors(validation);
    if (Object.keys(validation).length) {
      setError({ message: "Complete the highlighted questionnaire options before publishing." });
      return;
    }
    setError(null);
    setConfirmPublish(true);
  }

  async function confirmAndPublish() {
    if (!versionId) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await replaceQuestions();
      await apiRequest(`/api/v1/admin/questionnaires/${questionnaireId}/versions/${versionId}/publish`, { method: "POST" });
      setConfirmPublish(false);
      await load();
    } catch (cause) {
      handleApiError(cause);
    } finally {
      setBusy(false);
    }
  }

  if (!versionId) return <div className="alert">Choose a questionnaire version from the list.</div>;
  if (!version && !error) return <LoadingCards />;
  const editable = version?.status === "DRAFT";

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">{version?.questionnaireName || "Questionnaire"}</p>
          <h1>Version {version?.versionNumber}</h1>
          <p>{editable ? "Array order becomes passenger display order. Save sends the complete intended question list." : "This published or retired version is immutable and shown for historical review."}</p>
        </div>
        {version && <StatusBadge label={version.status} tone={editable ? "warning" : version.status === "ACTIVE" ? "success" : "neutral"} />}
      </div>
      {error && <ErrorAlert message={error.message} requestId={error.requestId} />}
      <div className="stack">
        {questions.map((question, index) => {
          const questionPath = `questions.${index}`;
          return <section className="card card-pad" key={question.clientKey}>
            <div className="trip-card-head">
              <span className="eyebrow">Question {index + 1}</span>
              {editable && (
                <button className="button button-secondary" onClick={() => setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))}>
                  Remove
                </button>
              )}
            </div>
            <div className="grid-2">
              <EditorField label="Stable key" error={fieldErrors[`${questionPath}.stableKey`]}>
                <input className="input" aria-invalid={!!fieldErrors[`${questionPath}.stableKey`]} value={question.stableKey} disabled={!editable} onChange={(event) => update(index, { stableKey: event.target.value })} />
              </EditorField>
              <EditorField label="Question prompt" error={fieldErrors[`${questionPath}.prompt`]}>
                <input className="input" aria-invalid={!!fieldErrors[`${questionPath}.prompt`]} value={question.prompt} disabled={!editable} maxLength={1000} onChange={(event) => update(index, { prompt: event.target.value })} />
              </EditorField>
              <EditorField label="Question type">
                <select
                  className="select"
                  value={question.questionType}
                  disabled={!editable}
                  onChange={(event) => {
                    const questionType = event.target.value as QuestionType;
                    update(index, {
                      questionType,
                      options: hasOptions(questionType)
                        ? question.options.length
                          ? question.options
                          : isConfigurableChoice(questionType)
                            ? []
                            : [
                                { ...newOption(), valueKey: "yes", label: "Yes", scoreValue: 5 },
                                { ...newOption(), valueKey: "no", label: "No", scoreValue: 1 },
                              ]
                        : [],
                      contributesToScore: questionType !== "TEXT",
                    });
                  }}
                >
                  {types.map((type) => <option key={type}>{type}</option>)}
                </select>
              </EditorField>
              <EditorField label="Category">
                <select className="select" value={question.category} disabled={!editable} onChange={(event) => update(index, { category: event.target.value as QuestionCategory })}>
                  {categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </EditorField>
            </div>
            <div className="choice-grid">
              <label className="choice">
                <input type="checkbox" checked={question.isRequired} disabled={!editable} onChange={(event) => update(index, { isRequired: event.target.checked })} />
                Required
              </label>
              {question.questionType !== "TEXT" && (
                <label className="choice">
                  <input type="checkbox" checked={question.contributesToScore} disabled={!editable} onChange={(event) => update(index, { contributesToScore: event.target.checked })} />
                  Contributes to score
                </label>
              )}
            </div>
            {question.questionType === "STAR_RATING" && question.contributesToScore && (
              <div className="grid-2" style={{ marginTop: "1rem" }}>
                <EditorField label="Minimum score">
                  <input className="input" type="number" value={question.scoreMin ?? 1} disabled={!editable} onChange={(event) => update(index, { scoreMin: Number(event.target.value) })} />
                </EditorField>
                <EditorField label="Maximum score">
                  <input className="input" type="number" value={question.scoreMax ?? 5} disabled={!editable} onChange={(event) => update(index, { scoreMax: Number(event.target.value) })} />
                </EditorField>
              </div>
            )}
            {hasOptions(question.questionType) && (
              <div className="option-editor">
                <div className="option-editor-head">
                  <div>
                    <h3 className="section-title">Ordered options</h3>
                    <p>Options appear to passengers in this order. Value keys are generated once and remain stable.</p>
                  </div>
                  {editable && <button type="button" className="button button-secondary" onClick={() => addOption(index)}>Add option</button>}
                </div>
                {fieldErrors[`${questionPath}.options`] && <div className="field-error" role="alert">{fieldErrors[`${questionPath}.options`]}</div>}
                {question.options.length === 0 && <p className="option-empty">No options yet. Drafts can be saved now, but at least two options are required before publishing.</p>}
                <ol className="option-list">
                  {question.options.map((option, optionIndex) => {
                    const optionPath = `${questionPath}.options.${optionIndex}`;
                    return (
                      <li className={question.contributesToScore ? "option-row option-row-scored" : "option-row"} key={option.clientKey}>
                        <span className="option-number" aria-hidden="true">{optionIndex + 1}</span>
                        <EditorField label={`Option ${optionIndex + 1} label`} error={fieldErrors[`${optionPath}.label`]}>
                          <input
                            className="input"
                            aria-invalid={!!fieldErrors[`${optionPath}.label`]}
                            value={option.label}
                            disabled={!editable}
                            maxLength={200}
                            onChange={(event) => updateOption(index, optionIndex, { label: event.target.value })}
                          />
                        </EditorField>
                        <EditorField label="Stable value key" error={fieldErrors[`${optionPath}.valueKey`]}>
                          <input className="input input-readonly" value={option.valueKey} readOnly aria-readonly="true" aria-invalid={!!fieldErrors[`${optionPath}.valueKey`]} tabIndex={editable ? 0 : -1} />
                        </EditorField>
                        {question.contributesToScore && (
                          <EditorField label="Score" error={fieldErrors[`${optionPath}.scoreValue`]}>
                            <input
                              className="input"
                              type="number"
                              step="any"
                              aria-invalid={!!fieldErrors[`${optionPath}.scoreValue`]}
                              value={option.scoreValue ?? ""}
                              disabled={!editable}
                              onChange={(event) => updateOption(index, optionIndex, { scoreValue: event.target.value === "" ? null : Number(event.target.value) })}
                            />
                          </EditorField>
                        )}
                        {editable && (
                          <div className="option-actions" aria-label={`Reorder or remove option ${optionIndex + 1}`}>
                            <button type="button" className="option-action" disabled={optionIndex === 0} onClick={() => moveOption(index, optionIndex, -1)} aria-label={`Move option ${optionIndex + 1} up`}>↑</button>
                            <button type="button" className="option-action" disabled={optionIndex === question.options.length - 1} onClick={() => moveOption(index, optionIndex, 1)} aria-label={`Move option ${optionIndex + 1} down`}>↓</button>
                            <button type="button" className="option-action option-action-remove" onClick={() => removeOption(index, optionIndex)} aria-label={`Remove option ${optionIndex + 1}`}>Remove</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </section>
        })}
      </div>
      {editable && (
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button className="button button-secondary" onClick={add}>Add question</button>
          <div className="trip-actions">
            <button className="button button-secondary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save complete draft"}</button>
            <button className="button" disabled={busy || questions.length === 0} onClick={publish}>Publish immutable version</button>
          </div>
        </div>
      )}
      <button className="button button-secondary" style={{ marginTop: "1rem" }} onClick={() => router.push("/admin/questionnaires")}>Back to questionnaires</button>
      {confirmPublish && <AlertDialog title={`Publish version ${version?.versionNumber}?`} confirmLabel="Publish version" busy={busy} onCancel={() => setConfirmPublish(false)} onConfirm={() => void confirmAndPublish()}><p>This version will become immutable and the currently active questionnaire will be retired. The complete draft will be saved immediately before publishing.</p></AlertDialog>}
    </>
  );
}

function EditorField({ label, children, error }: { label: string; children: ReactNode; error?: string }) {
  return <label className="field"><span>{label}</span>{children}{error && <small className="field-error" role="alert">{error}</small>}</label>;
}
