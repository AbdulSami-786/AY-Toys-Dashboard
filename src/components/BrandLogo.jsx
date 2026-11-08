import logo from '../assets/cas-logo.png';

// The CAS World Wide mark (header, welcome and login screens)
export default function BrandLogo({ className = '' }) {
  return <img className={'brand-logo ' + className} src={logo} alt="CAS World Wide" draggable={false} />;
}
