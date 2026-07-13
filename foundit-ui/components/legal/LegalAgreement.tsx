import { Link } from '@chakra-ui/react';

interface LegalAgreementProps {
  onOpen: () => void;
}

export default function LegalAgreement({ onOpen }: LegalAgreementProps) {
  return (
    <>
      I have read and agree to the{' '}
      <Link
        color="blue.500"
        textDecoration="underline"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpen();
        }}
      >
        Privacy Policy, Security Statement, and FIPPA Notice
      </Link>
      .
    </>
  );
}
