'use client';

import { useState, useEffect, useRef } from 'react';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const SCENARIOS = [
  "Hi, this is Sarah from Riverside Home Care. Placing an order for Margaret Johnson, DOB 04/12/1948. She's on Medicare, ID 1EG4-TE5-MK72. Her physician is Dr. Robert Chen, NPI 1234567890, based in Brooklyn. Diagnosis is Z99.89. She needs a standard manual wheelchair, quantity 1. Delivery to 42 Maple Street, Brooklyn NY 11201.",
  "Hey, need to place an order for a patient named Tom. He needs a CPAP machine. He's on some kind of government insurance. Delivery is somewhere in Queens. Let me know if you got this.",
  "Hi, placing an order for David Park, DOB 03/15/1952. He's on Medicare, ID 2TG5-RF8-NK44. Physician is Dr. Amy Torres, NPI 4567891230, practicing in New Jersey. Diagnosis is I10 — hypertension. He needs a power wheelchair, quantity 1. Delivery to 88 Clinton Street, New York NY 10002.",
];

interface OrderData {
  patientName: string | null;
  dateOfBirth: string | null;
  insuranceType: string | null;
  insuranceId: string | null;
  physicianName: string | null;
  npiNumber: string | null;
  diagnosisCode: string | null;
  product: string | null;
  quantity: string | number | null;
  deliveryAddress: string | null;
  status: string | null;
  riskFlags?: string[];
}

const FIELD_KEYS: { key: keyof OrderData; label: string }[] = [
  { key: 'patientName', label: 'PATIENT NAME' },
  { key: 'dateOfBirth', label: 'DATE OF BIRTH' },
  { key: 'insuranceType', label: 'INSURANCE TYPE' },
  { key: 'insuranceId', label: 'INSURANCE ID' },
  { key: 'physicianName', label: 'PHYSICIAN NAME' },
  { key: 'npiNumber', label: 'NPI NUMBER' },
  { key: 'diagnosisCode', label: 'DIAGNOSIS CODE' },
  { key: 'product', label: 'PRODUCT' },
  { key: 'quantity', label: 'QUANTITY' },
  { key: 'deliveryAddress', label: 'DELIVERY ADDRESS' },
];

const FIELD_GROUPS: { groupLabel: string; fields: { key: keyof OrderData; label: string }[] }[] = [
  {
    groupLabel: 'PATIENT',
    fields: [
      { key: 'patientName', label: 'PATIENT NAME' },
      { key: 'dateOfBirth', label: 'DATE OF BIRTH' },
    ],
  },
  {
    groupLabel: 'INSURANCE',
    fields: [
      { key: 'insuranceType', label: 'INSURANCE TYPE' },
      { key: 'insuranceId', label: 'INSURANCE ID' },
    ],
  },
  {
    groupLabel: 'PHYSICIAN',
    fields: [
      { key: 'physicianName', label: 'PHYSICIAN NAME' },
      { key: 'npiNumber', label: 'NPI NUMBER' },
    ],
  },
  {
    groupLabel: 'ORDER',
    fields: [
      { key: 'diagnosisCode', label: 'DIAGNOSIS CODE' },
      { key: 'product', label: 'PRODUCT' },
      { key: 'quantity', label: 'QUANTITY' },
      { key: 'deliveryAddress', label: 'DELIVERY ADDRESS' },
    ],
  },
];

const STATUS_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  ACCEPTED:             { bg: '#F0FDF9', color: '#0B7A6A', border: '#6EE7D8' },
  ACTION_REQUIRED:      { bg: '#FFF3F2', color: '#DC4C3E', border: '#FECACA' },
  REVIEW_REQUIRED:      { bg: '#FFF8E8', color: '#C58A00', border: '#FDE68A' },
  INELIGIBLE_INSURANCE: { bg: '#FFF8E8', color: '#C58A00', border: '#FDE68A' },
};

const SHADOW = '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)';

export default function Home() {
  const [orderText, setOrderText] = useState('');
  const [parsedData, setParsedData] = useState<OrderData | null>(null);
  const [riskFlags, setRiskFlags] = useState<string[]>([]);
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [animatedFields, setAnimatedFields] = useState<Set<string>>(new Set());
  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimestamp(
        now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
          ' ' +
          now.toLocaleTimeString('en-US', { hour12: false })
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const handleProcess = async () => {
    if (!orderText.trim() || isProcessing) return;

    setIsProcessing(true);
    setParsedData(null);
    setRiskFlags([]);
    setResponse('');
    setStatus(null);
    setAnimatedFields(new Set());

    const res = await fetch('/api/process-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: orderText }),
    });

    if (!res.body) {
      setIsProcessing(false);
      return;
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let dataHandled = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      fullText += decoder.decode(value, { stream: true })

      if (!dataHandled && fullText.includes('\n')) {
        const firstNewline = fullText.indexOf('\n')
        const firstLine = fullText.slice(0, firstNewline)
        const rest = fullText.slice(firstNewline + 1)

        if (firstLine.startsWith('DATA:')) {
          try {
            const parsed = JSON.parse(firstLine.slice(5))
            setParsedData(parsed)
            setStatus(parsed.status)
            if (Array.isArray(parsed.riskFlags)) {
              setRiskFlags(parsed.riskFlags)
            }
            const keys = FIELD_KEYS.map((f) => f.key);
            keys.forEach((key, i) => {
              setTimeout(() => {
                setAnimatedFields((prev) => new Set(prev).add(key));
              }, i * 80);
            });
          } catch (e) {
            console.error('parse error', e)
          }
        }

        dataHandled = true
        fullText = rest
        setResponse(rest)
      } else if (dataHandled) {
        setResponse(fullText)
      }
    }

    setIsProcessing(false);
  };

  return (
    <div
      className={inter.className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#F6F7F8',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          minHeight: 56,
          background: '#FFFFFF',
          borderBottom: '1px solid #E8ECF0',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#16181D' }}>
            INTAKE OS
          </span>
          <span style={{ color: '#E8ECF0', margin: '0 12px', userSelect: 'none' }}>|</span>
          <span style={{ fontSize: 12, color: '#98A2B3', fontWeight: 400 }}>
            DME ORDER INTELLIGENCE
          </span>
        </div>
        <span style={{ fontSize: 11, color: '#98A2B3' }}>
          {timestamp}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div
          className="sidebar"
          style={{
            width: 260,
            minWidth: 260,
            background: '#FBFBFA',
            borderRight: '1px solid #E8ECF0',
            overflowY: 'auto',
          }}
        >
          {FIELD_GROUPS.map((group, groupIdx) => (
            <div
              key={group.groupLabel}
              style={groupIdx > 0 ? { borderTop: '1px solid #F0F2F5', marginTop: 4 } : {}}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#98A2B3',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: groupIdx === 0 ? '16px 16px 8px' : '20px 16px 8px',
                }}
              >
                {group.groupLabel}
              </div>

              {group.fields.map(({ key, label }) => {
                const value = parsedData ? parsedData[key] : undefined;
                const hasValue = parsedData && value !== null && value !== undefined;
                const isNull = parsedData && (value === null || value === undefined);
                const isVisible = animatedFields.has(key);

                return (
                  <div
                    key={key}
                    style={{
                      padding: '2px 16px 14px',
                      opacity: parsedData ? (isVisible ? 1 : 0) : 1,
                      transition: 'opacity 200ms ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      {hasValue && (
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: '#0EA5A4',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: isNull ? '#DC4C3E' : '#98A2B3',
                        }}
                      >
                        {label}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: hasValue ? 600 : 400,
                        color: hasValue ? '#16181D' : '#D0D5DD',
                        marginTop: 3,
                      }}
                    >
                      {hasValue ? String(value) : '———'}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Risk Flags */}
          <div
            style={{
              borderTop: '1px solid #F0F2F5',
              marginTop: 4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: '#98A2B3',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '20px 16px 8px',
              }}
            >
              RISK FLAGS
            </div>

            {riskFlags.length > 0 ? (
              riskFlags.map((flag, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#C58A00',
                    padding: '4px 16px 8px',
                  }}
                >
                  ⚠ {flag}
                </div>
              ))
            ) : (
              <div style={{ fontSize: 12, color: '#98A2B3', padding: '4px 16px 8px' }}>
                No flags detected
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: '#F6F7F8',
          }}
        >
          {/* Input Area */}
          <div style={{ flexShrink: 0 }}>

            {/* Scenario buttons row */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                padding: '12px 16px',
                flexWrap: 'wrap',
                background: '#FFFFFF',
                borderBottom: '1px solid #E8ECF0',
              }}
            >
              {['SCENARIO 01 — COMPLETE ORDER', 'SCENARIO 02 — MISSING FIELDS', 'SCENARIO 03 — CLINICAL MISMATCH'].map(
                (label, i) => (
                  <button
                    key={i}
                    className="scenario-btn"
                    onClick={() => setOrderText(SCENARIOS[i])}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      background: '#F6F7F8',
                      border: '1px solid #E8ECF0',
                      color: '#667085',
                      padding: '6px 16px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      transition: 'background 150ms, border-color 150ms, color 150ms',
                    }}
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            {/* Input card */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E8ECF0',
                borderRadius: 12,
                margin: 16,
                position: 'relative',
                boxShadow: SHADOW,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#98A2B3',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '14px 16px 10px',
                  borderBottom: '1px solid #F6F7F8',
                }}
              >
                ORDER INPUT
              </div>

              <textarea
                value={orderText}
                onChange={(e) => setOrderText(e.target.value)}
                placeholder="Paste partner order here — email, fax transcription, or free text."
                style={{
                  width: '100%',
                  minHeight: 140,
                  border: 'none',
                  background: 'transparent',
                  color: '#16181D',
                  fontSize: 14,
                  lineHeight: 1.6,
                  padding: '14px 16px',
                  paddingBottom: 60,
                  resize: 'none',
                  outline: 'none',
                  display: 'block',
                }}
              />

              <button
                className="process-btn"
                onClick={handleProcess}
                disabled={isProcessing}
                style={{
                  position: 'absolute',
                  bottom: 12,
                  right: 12,
                  fontSize: 13,
                  fontWeight: 600,
                  background: isProcessing ? '#7DD3D3' : '#0EA5A4',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: 8,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  transition: 'background 150ms',
                }}
              >
                {isProcessing ? 'PROCESSING...' : 'PROCESS ORDER →'}
              </button>
            </div>
          </div>

          {/* Response card */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #E8ECF0',
              borderRadius: 12,
              margin: '0 16px 16px',
              padding: 24,
              flex: 1,
              overflowY: 'auto',
              minHeight: 0,
              boxShadow: SHADOW,
            }}
          >
            {status && STATUS_BADGE[status] && (
              <div
                style={{
                  display: 'inline-block',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  background: STATUS_BADGE[status].bg,
                  color: STATUS_BADGE[status].color,
                  border: `1px solid ${STATUS_BADGE[status].border}`,
                  padding: '5px 14px',
                  borderRadius: 999,
                  marginBottom: 20,
                }}
              >
                {status.replace(/_/g, ' ')}
              </div>
            )}

            {response && (
              <div
                ref={responseRef}
                style={{
                  fontSize: 15,
                  color: '#374151',
                  borderLeft: '3px solid #E8ECF0',
                  paddingLeft: 20,
                  lineHeight: 1.8,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {response}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
