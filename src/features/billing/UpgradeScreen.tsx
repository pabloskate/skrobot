'use client';

interface Props {
  onCancel?: () => void;
}

export default function UpgradeScreen({ onCancel }: Props) {
  return (
    <div className="container upgrade-screen">
      <div className="panel center">
        <h2 className="panel-title">Beta limit reached</h2>
        <p className="muted">
          You get 15 voice games every rolling 7 days during the beta. Your next voice games unlock as older sessions roll
          out of that window.
        </p>
        {onCancel && (
          <button className="btn-primary" onClick={onCancel}>
            Back
          </button>
        )}
      </div>
    </div>
  );
}
