/** Select with a CSS chevron that doesn't get wiped by background-color. */
export default function Select({ className = '', children, ...props }) {
  return (
    <div className="form-select-wrap">
      <select className={`form-select ${className}`.trim()} {...props}>
        {children}
      </select>
    </div>
  );
}
